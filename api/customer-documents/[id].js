import { db, storage } from "hatchable";

export const access="user";
export const methods=["GET","POST","DELETE"];

async function business(uid){
  const {rows}=await db.query("SELECT id FROM businesses WHERE owner_user_id=$1 LIMIT 1",[uid]);
  return rows[0]||null;
}
const allowed=new Set([
  "application/pdf","image/png","image/jpeg","image/webp",
  "application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
]);

export default async function(req,res){
  const b=await business(req.user.id);
  if(!b) return res.status(404).json({error:"Business not found"});
  const customerId=req.params.id;
  const {rows:c}=await db.query("SELECT id FROM customers WHERE id=$1 AND business_id=$2",[customerId,b.id]);
  if(!c[0]) return res.status(404).json({error:"Customer not found"});

  if(req.method==="GET"){
    const documentId=req.query&&req.query.document_id;
    if(documentId){
      const {rows:d}=await db.query("SELECT * FROM customer_documents WHERE id=$1 AND customer_id=$2 AND business_id=$3",[documentId,customerId,b.id]);
      if(!d[0]) return res.status(404).json({error:"Document not found"});
      const file=await storage.get(d[0].storage_url);
      res.setHeader("Content-Type",d[0].content_type||file.contentType||"application/octet-stream");
      res.setHeader("Content-Disposition",`inline; filename="${String(d[0].file_name||"document").replace(/[^a-zA-Z0-9._-]/g,"_")}"`);
      return res.send(file.buffer);
    }
    const {rows}=await db.query("SELECT id,file_name,content_type,size_bytes,storage_url,created_at FROM customer_documents WHERE customer_id=$1 AND business_id=$2 ORDER BY created_at DESC",[customerId,b.id]);
    return res.json({documents:rows.map(x=>({...x,storage_url:`/api/customer-documents/${customerId}?document_id=${x.id}`}))});
  }

  if(req.method==="DELETE"){
    const documentId=req.query&&req.query.document_id;
    if(!documentId) return res.status(400).json({error:"Document id is required"});
    const {rows}=await db.query("DELETE FROM customer_documents WHERE id=$1 AND customer_id=$2 AND business_id=$3 RETURNING *",[documentId,customerId,b.id]);
    if(!rows[0]) return res.status(404).json({error:"Document not found"});
    if(rows[0].storage_url) await storage.del(rows[0].storage_url).catch(()=>{});
    return res.json({ok:true});
  }

  const files=req.files||[];
  if(!files.length) return res.status(400).json({error:"Choose at least one file"});
  const {rows:countRows}=await db.query("SELECT COUNT(*)::int AS count FROM customer_documents WHERE customer_id=$1 AND business_id=$2",[customerId,b.id]);
  const existing=countRows[0].count||0;
  if(existing+files.length>3) return res.status(400).json({error:"A customer can have a maximum of 3 documents"});

  const saved=[];
  for(const file of files){
    if(file.buffer.length>10*1024*1024) return res.status(400).json({error:`${file.filename||"File"} exceeds the 10 MB limit`});
    if(file.contentType&&!allowed.has(file.contentType)) return res.status(400).json({error:`${file.filename||"File"} has an unsupported file type`});
    const safe=(file.filename||"document").replace(/[^a-zA-Z0-9._-]/g,"_");
    const key=`customer-documents/${b.id}/${customerId}/${Date.now()}-${safe}`;
    const url=await storage.put(key,file.buffer,file.contentType||"application/octet-stream");
    const {rows}=await db.query(
      `INSERT INTO customer_documents (business_id,customer_id,file_name,content_type,size_bytes,storage_url)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,file_name,content_type,size_bytes,storage_url,created_at`,
      [b.id,customerId,file.filename||safe,file.contentType||null,file.buffer.length,url]);
    saved.push(rows[0]);
  }
  res.status(201).json({documents:saved});
}