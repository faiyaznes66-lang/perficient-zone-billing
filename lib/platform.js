import pg from "pg";
import nodemailer from "nodemailer";
import { createClient } from "@supabase/supabase-js";

const { Pool }=pg;
export const pool=new Pool({
  connectionString:process.env.DATABASE_URL,
  ssl:process.env.NODE_ENV==="production"?{rejectUnauthorized:false}:false
});
export const db={
  query:(sql,params=[])=>pool.query(sql,params),
  async transaction(queries=[]){
    const client=await pool.connect();
    try{
      await client.query("BEGIN");const results=[];
      for(const q of queries)results.push(await client.query(q.sql,q.params||[]));
      await client.query("COMMIT");return{results};
    }catch(e){await client.query("ROLLBACK");throw e}
    finally{client.release()}
  }
};
export const supabaseAdmin=createClient(process.env.SUPABASE_URL,(process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_ANON_KEY),{auth:{persistSession:false,autoRefreshToken:false}});
const publicBucket=()=>process.env.SUPABASE_PUBLIC_BUCKET||"perficient-zone-billing-public";
const privateBucket=()=>process.env.SUPABASE_PRIVATE_BUCKET||"perficient-zone-billing-private";
const splitStored=value=>{
  const s=String(value||"");
  if(s.startsWith("private://"))return{bucket:privateBucket(),key:s.slice(10),private:true};
  if(s.startsWith("public://"))return{bucket:publicBucket(),key:s.slice(9),private:false};
  return{bucket:s.startsWith("customer-documents/")?privateBucket():publicBucket(),key:s,private:s.startsWith("customer-documents/")};
};
export const storage={
  async put(key,buffer,contentType="application/octet-stream"){
    const isPrivate=String(key).startsWith("customer-documents/");
    const bucket=isPrivate?privateBucket():publicBucket();
    const {error}=await supabaseAdmin.storage.from(bucket).upload(key,buffer,{contentType,upsert:true});if(error)throw error;
    if(isPrivate)return"private://"+key;
    return supabaseAdmin.storage.from(bucket).getPublicUrl(key).data.publicUrl;
  },
  async get(value){
    const x=splitStored(value);
    const {data,error}=await supabaseAdmin.storage.from(x.bucket).download(x.key);if(error)throw error;
    return{buffer:Buffer.from(await data.arrayBuffer()),contentType:data.type||"application/octet-stream"};
  },
  async del(value){
    const x=splitStored(value);
    const {error}=await supabaseAdmin.storage.from(x.bucket).remove([x.key]);if(error)throw error;
  }
};
let transporter;
function mailer(){if(!transporter)transporter=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:Number(process.env.SMTP_PORT||587)===465,auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}});return transporter}
export const email={send:({to,subject,html})=>mailer().sendMail({from:process.env.SMTP_FROM,to,subject,html})};
export const browser={
  async pdf(url){
    if(!process.env.BROWSERLESS_URL)throw new Error("PDF service not configured");
    const endpoint=process.env.BROWSERLESS_URL+(process.env.BROWSERLESS_TOKEN?(process.env.BROWSERLESS_URL.includes("?")?"&":"?")+"token="+encodeURIComponent(process.env.BROWSERLESS_TOKEN):"");
    const r=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url,options:{format:"A4",printBackground:true}})});
    if(!r.ok)throw new Error("PDF service failed");return Buffer.from(await r.arrayBuffer());
  }
};