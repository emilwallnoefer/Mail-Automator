-- Security audit run-3, hardening note H4. Apply by hand.
--
-- 2026-07-04-tier1-hardening.sql set a server-side size cap on the
-- `chat-attachments` bucket but no `allowed_mime_types`, and the stored
-- content-type is entirely client-supplied (src/lib/chat.ts:328 passes
-- `file.type` straight through). A user could therefore upload evil.html or
-- evil.svg and have Storage serve it back with that content-type.
--
-- Impact is limited — the bucket is private, access is via 1-hour signed URLs,
-- and those are served from <project-ref>.supabase.co, a DIFFERENT origin from
-- the app, so this is not app-session XSS. It is still script execution on the
-- Supabase origin, which is same-origin with the Supabase REST API, so it is
-- worth closing.
--
-- The chat UI sets no `accept` filter, so people may already have shared all
-- sorts of files. This list is therefore deliberately BROAD: it keeps every
-- ordinary attachment working and excludes only the types a browser will
-- execute as markup or script — text/html, application/xhtml+xml,
-- image/svg+xml, application/javascript, and friends.
--
-- If a colleague reports "file type not supported" on something legitimate,
-- extend this list rather than removing it. Adding image/svg+xml back would
-- reopen the hole; convert to PNG instead.
--
-- Safe to re-run.

update storage.buckets
  set allowed_mime_types = array[
    -- images (no SVG: it is executable markup)
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'image/avif',
    'image/bmp',
    'image/tiff',
    'image/heic',
    'image/heif',
    -- documents
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/rtf',
    'application/vnd.oasis.opendocument.text',
    'application/vnd.oasis.opendocument.spreadsheet',
    -- plain text and data (rendered as text, never as markup, thanks to nosniff)
    'text/plain',
    'text/csv',
    'text/markdown',
    'application/json',
    'application/xml',
    'text/xml',
    -- archives
    'application/zip',
    'application/x-zip-compressed',
    'application/gzip',
    'application/x-tar',
    'application/x-7z-compressed',
    -- media
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
    'audio/mp4',
    -- generic fallback for files the browser could not type; served as a
    -- download, never executed
    'application/octet-stream'
  ]
  where id = 'chat-attachments';
