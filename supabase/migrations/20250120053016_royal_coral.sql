/*
  # Content Automation System Schema

  1. New Tables
    - `content`
      - `id` (uuid, primary key)
      - `created_at` (timestamp)
      - `title` (text)
      - `content` (text)
      - `type` (text) - e.g., 'blog_post', 'social_media', 'newsletter'
      - `metadata` (jsonb) - flexible metadata storage
      - `source_url` (text) - original content source
      - `status` (text) - e.g., 'draft', 'published', 'archived'
      - `user_id` (uuid) - reference to auth.users

  2. Security
    - Enable RLS on content table
    - Add policies for authenticated users to manage their content
*/

-- Create content table
CREATE TABLE content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  title text NOT NULL,
  content text NOT NULL,
  type text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  source_url text,
  status text DEFAULT 'draft',
  user_id uuid REFERENCES auth.users(id),
  CONSTRAINT valid_status CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT valid_type CHECK (type IN ('blog_post', 'social_media', 'newsletter'))
);

-- Enable RLS
ALTER TABLE content ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can create their own content"
  ON content
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own content"
  ON content
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own content"
  ON content
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create indexes
CREATE INDEX content_type_idx ON content(type);
CREATE INDEX content_status_idx ON content(status);
CREATE INDEX content_user_id_idx ON content(user_id);