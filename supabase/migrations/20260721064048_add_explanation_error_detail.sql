alter table public.explanations
  add column if not exists error_detail text
  check (error_detail is null or length(error_detail) <= 4000);
