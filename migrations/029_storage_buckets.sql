INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES
('perficient-zone-billing-public','perficient-zone-billing-public',true,2097152,ARRAY['image/png','image/jpeg','image/webp']::text[]),
('perficient-zone-billing-private','perficient-zone-billing-private',false,10485760,ARRAY[
'application/pdf','image/png','image/jpeg','image/webp',
'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]::text[])
ON CONFLICT (id) DO UPDATE SET
 public=EXCLUDED.public,
 file_size_limit=EXCLUDED.file_size_limit,
 allowed_mime_types=EXCLUDED.allowed_mime_types;
