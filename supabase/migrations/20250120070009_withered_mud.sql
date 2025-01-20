/*
  # Add comprehensive storage tables

  1. New Tables
    - `images`: Store downloaded images and their metadata
    - `keywords`: Store extracted keywords with relevance scores
    - `metadata_tracking`: Track all metadata changes
    - `content_versions`: Track content revisions
    - `content_relationships`: Track relationships between content items

  2. Security
    - Enable RLS on all new tables
    - Add policies for authenticated users
    - Add policies for system operations

  3. Changes
    - Add new indexes for performance
    - Add foreign key relationships
*/

-- Create images table
CREATE TABLE images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  content_id uuid REFERENCES content(id) ON DELETE CASCADE,
  original_url text NOT NULL,
  local_path text NOT NULL,
  file_name text NOT NULL,
  file_size integer,
  mime_type text,
  width integer,
  height integer,
  alt_text text,
  caption text,
  metadata jsonb DEFAULT '{}'::jsonb,
  user_id uuid REFERENCES auth.users(id)
);

-- Create keywords table
CREATE TABLE keywords (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  content_id uuid REFERENCES content(id) ON DELETE CASCADE,
  keyword text NOT NULL,
  relevance_score float NOT NULL,
  frequency integer NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  user_id uuid REFERENCES auth.users(id)
);

-- Create metadata_tracking table
CREATE TABLE metadata_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  content_id uuid REFERENCES content(id) ON DELETE CASCADE,
  field_name text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  change_type text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  user_id uuid REFERENCES auth.users(id)
);

-- Create content_versions table
CREATE TABLE content_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  content_id uuid REFERENCES content(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  content text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  user_id uuid REFERENCES auth.users(id)
);

-- Create content_relationships table
CREATE TABLE content_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  source_content_id uuid REFERENCES content(id) ON DELETE CASCADE,
  target_content_id uuid REFERENCES content(id) ON DELETE CASCADE,
  relationship_type text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  user_id uuid REFERENCES auth.users(id),
  CONSTRAINT unique_relationship UNIQUE(source_content_id, target_content_id, relationship_type)
);

-- Enable RLS on all tables
ALTER TABLE images ENABLE ROW LEVEL SECURITY;
ALTER TABLE keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE metadata_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_relationships ENABLE ROW LEVEL SECURITY;

-- Create policies for images
CREATE POLICY "Users can insert their own images"
  ON images
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own images"
  ON images
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Create policies for keywords
CREATE POLICY "Users can insert keywords"
  ON keywords
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their keywords"
  ON keywords
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Create policies for metadata tracking
CREATE POLICY "Users can insert metadata changes"
  ON metadata_tracking
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their metadata changes"
  ON metadata_tracking
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Create policies for content versions
CREATE POLICY "Users can insert content versions"
  ON content_versions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their content versions"
  ON content_versions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Create policies for content relationships
CREATE POLICY "Users can manage their content relationships"
  ON content_relationships
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX idx_images_content_id ON images(content_id);
CREATE INDEX idx_keywords_content_id ON keywords(content_id);
CREATE INDEX idx_keywords_relevance ON keywords(relevance_score DESC);
CREATE INDEX idx_metadata_tracking_content_id ON metadata_tracking(content_id);
CREATE INDEX idx_content_versions_content_id_version ON content_versions(content_id, version_number DESC);
CREATE INDEX idx_content_relationships_source ON content_relationships(source_content_id);
CREATE INDEX idx_content_relationships_target ON content_relationships(target_content_id);
CREATE INDEX idx_content_relationships_type ON content_relationships(relationship_type);

-- Add triggers for automatic version tracking
CREATE OR REPLACE FUNCTION create_content_version()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO content_versions (
    content_id,
    version_number,
    content,
    metadata,
    user_id
  )
  SELECT
    NEW.id,
    COALESCE((
      SELECT MAX(version_number) + 1
      FROM content_versions
      WHERE content_id = NEW.id
    ), 1),
    NEW.content,
    NEW.metadata,
    NEW.user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER track_content_versions
  AFTER INSERT OR UPDATE ON content
  FOR EACH ROW
  EXECUTE FUNCTION create_content_version();

-- Add function to track metadata changes
CREATE OR REPLACE FUNCTION track_metadata_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.metadata IS DISTINCT FROM NEW.metadata THEN
    INSERT INTO metadata_tracking (
      content_id,
      field_name,
      old_value,
      new_value,
      change_type,
      user_id
    )
    SELECT
      NEW.id,
      key,
      CASE
        WHEN OLD.metadata ? key THEN jsonb_build_object(key, OLD.metadata->key)
        ELSE NULL
      END,
      jsonb_build_object(key, value),
      CASE
        WHEN OLD.metadata ? key THEN 'UPDATE'
        ELSE 'INSERT'
      END,
      NEW.user_id
    FROM jsonb_each(NEW.metadata) AS fields(key, value)
    WHERE NOT (OLD.metadata ? key) OR OLD.metadata->key IS DISTINCT FROM value;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER track_metadata_changes
  AFTER UPDATE ON content
  FOR EACH ROW
  EXECUTE FUNCTION track_metadata_changes();