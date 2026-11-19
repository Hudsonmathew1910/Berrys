-- Public bucket for product photos. Uploads happen only from the server with
-- the service-role key (see app/api/admin/upload), so no insert policy is needed.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('product-images', 'product-images', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;
