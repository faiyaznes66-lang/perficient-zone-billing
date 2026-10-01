import { db, storage } from "hatchable";

export const access="user";
export const methods=["POST"];

export default async function(req,res){
  const {rows:b}=await db.query("SELECT id FROM businesses WHERE owner_user_id=$1 LIMIT 1",[req.user.id]);
  if(!b[0]) return res.status(400).json({error:"Complete business setup first"});
  const file=req.files&&req.files[0];
  if(!file) return res.status(400).json({error:"Choose an image to upload"});
  if(!["image/png","image/jpeg","image/webp"].includes(file.contentType)) return res.status(400).json({error:"Use PNG, JPEG or WebP"});
  if(file.buffer.length>2*1024*1024) return res.status(400).json({error:"Logo must be under 2 MB"});
  const ext=file.contentType==="image/png"?"png":file.contentType==="image/webp"?"webp":"jpg";
  const key=`business-logos/${b[0].id}/logo.${ext}`;
  const url=await storage.put(key,file.buffer,file.contentType);
  const {rows}=await db.query("UPDATE businesses SET logo_url=$1,updated_at=now() WHERE id=$2 RETURNING *",[url,b[0].id]);
  res.json({business:rows[0],logo_url:url});
}