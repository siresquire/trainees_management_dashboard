-- Add 'manual' platform value for email-paste attendance sessions.
-- These sessions have no duration data; attendance is purely present/absent.
ALTER TYPE session_platform ADD VALUE IF NOT EXISTS 'manual';
