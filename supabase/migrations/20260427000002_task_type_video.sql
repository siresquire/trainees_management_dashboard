-- Add 'video' to task_type enum (safe — cannot be rolled back, but add value if not exists)
alter type task_type add value if not exists 'video';
