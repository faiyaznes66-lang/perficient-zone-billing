import express from "express";
import multer from "multer";
import cookieParser from "cookie-parser";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath,pathToFileURL } from "node:url";
import { db,supabaseAdmin } from "./lib/platform.js";

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const app=express(),upload=multer({storage:multer.memoryStorage(),limits:{fileSize:12*1024*1024,files:5}});
app.set("trust proxy",1);app.use(cookieParser());app.use(express.json({limit:"2mb"}));app.use(express.urlencoded({extended:true}));

async function appUser(token){
  const {data,error}=await supabaseAdmin.auth.getUser(token);if(error||!data?.user?.email)return null;
  const u=data.user;
  let {rows}=await db.query("SELECT * FROM app_users WHERE supabase_user_id=$1 OR lower(email)=lower($2) ORDER BY supabase_user_id=$1 DESC LIMIT 1",[u.id,u.email]);
  if(!rows[0]){
    ({rows}=await db.query("INSERT INTO app_users (id,email,name,supabase_user_id) VALUES ($1,$2,$3,$4) RETURNING *",[u.id,u.email,u.user_metadata?.name||null,u.id]));
  }else if(!rows[0].supabase_user_id){
    ({rows}=await db.query("UPDATE app_users SET supabase_user_id=$1,updated_at=now() WHERE id=$2 RETURNING *",[u.id,rows[0].id]));
  }
  return rows[0];
}
async function gate(access,req,res){
  if(access==="public"||!access)return true;
  if(access==="scheduler"){
    if(process.env.CRON_SECRET&&req.headers["x-cron-secret"]===process.env.CRON_SECRET)return true;
    res.status(401).json({error:"Scheduler authorization required"});return false;
  }
  const auth=req.headers.authorization||"",token=auth.startsWith("Bearer ")?auth.slice(7):"";
  if(!token){res.status(401).json({error:"Sign in required"});return false}
  const user=await appUser(token);if(!user){res.status(401).json({error:"Invalid session"});return false}
  req.user=user;return true;
}
function routeFrom(root,file,prefix=""){
  let rel=path.relative(root,file).replaceAll(path.sep,"/").replace(/\.js$/,"");
  rel=rel.replace(/\[\.\.\.([^\]]+)\]/g,"*$1").replace(/\[([^\]]+)\]/g,":$1");
  if(rel==="index")rel="";return prefix+"/"+rel;
}
async function filesUnder(dir){
  const out=[];for(const ent of await fs.readdir(dir,{withFileTypes:true})){const full=path.join(dir,ent.name);if(ent.isDirectory())out.push(...await filesUnder(full));else if(ent.isFile()&&ent.name.endsWith(".js"))out.push(full)}return out;
}
async function register(root,prefix){
  for(const file of await filesUnder(root)){
    const mod=await import(pathToFileURL(file));const route=routeFrom(root,file,prefix);
    const methods=(mod.methods||["GET"]).map(x=>x.toLowerCase());
    for(const method of methods){
      app[method](route,(req,res,next)=>{
        if(req.is("multipart/form-data"))upload.any()(req,res,err=>{if(err)return next(err);req.files=(req.files||[]).map(f=>({field:f.fieldname,filename:f.originalname,contentType:f.mimetype,buffer:f.buffer}));next()});
        else next();
      },async(req,res,next)=>{try{if(!await gate(mod.access,req,res))return;await mod.default(req,res)}catch(e){next(e)}});
    }
  }
}
app.get("/health",(req,res)=>res.json({ok:true,service:"perficient-zone-billing"}));
app.get("/runtime-config.js",(req,res)=>{res.type("application/javascript").send("window.__APP_CONFIG__="+JSON.stringify({api:"/api",supabaseUrl:process.env.SUPABASE_URL,supabaseAnonKey:process.env.SUPABASE_ANON_KEY})+";")});
await register(path.join(__dirname,"api"),"/api");
await register(path.join(__dirname,"pages"),"");
app.get("/login",(req,res)=>res.sendFile(path.join(__dirname,"public/login.html")));
app.use(express.static(path.join(__dirname,"public"),{extensions:["html"]}));
app.get("/app/*splat",(req,res)=>res.sendFile(path.join(__dirname,"public/app/index.html")));
app.use((err,req,res,next)=>{console.error(err);if(res.headersSent)return next(err);res.status(500).json({error:process.env.NODE_ENV==="production"?"Server error":err.message})});
const port=Number(process.env.PORT||3000);app.listen(port,()=>console.log("Perficient Zone Billing listening on",port));