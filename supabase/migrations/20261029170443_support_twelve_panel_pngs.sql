-- Twelve full-size panels can exceed the previous 10 MB export limit.
-- Keep the bucket private and PNG-only; no access policies are changed.
update storage.buckets
set file_size_limit = 33554432
where id = 'comic-artifacts';
