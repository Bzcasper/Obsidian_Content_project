/*
  # Add discovered URLs table

  1. New Tables
    - `discovered_urls`
      - `id` (uuid, primary key)
      - `created_at` (timestamp)
      - `url` (text, unique)
      - `title` (text)
      - `description` (text)
      - `source` (text)
      - `type` (text)
      - `trend` (text)
      - `score` (float)
      - `metadata` (jsonb)
      - `user_id` (uuid, foreign key)

  2. Security
    - Enable RLS on `discovered_urls` table
    - Add policies for authenticated users to:
      - Insert their own URLs
      - View their own URLs
      - Update their own URLs

  3. Changes
    - Add indexes for performance optimization
    - Add constraints for URL validation and score range
*/

-- Create discovered_urls table
CREATE TABLE discovered_urls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  url text NOT NULL,
  title text NOT NULL,
  description text,
  source text,
  type text NOT NULL,
  trend text NOT NULL,
  score float NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  user_id uuid REFERENCES auth.users(id),
  CONSTRAINT valid_url CHECK (url ~ '^https?://'),
  CONSTRAINT valid_score CHECK (score >= 0 AND score <= 10),
  CONSTRAINT unique_url UNIQUE (url)
);

-- Enable RLS
ALTER TABLE discovered_urls ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can insert their own URLs"
  ON discovered_urls
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own URLs"
  ON discovered_urls
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own URLs"
  ON discovered_urls
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create indexes
CREATE INDEX idx_discovered_urls_type ON discovered_urls(type);
CREATE INDEX idx_discovered_urls_trend ON discovered_urls(trend);
CREATE INDEX idx_discovered_urls_score ON discovered_urls(score DESC);
CREATE INDEX idx_discovered_urls_created_at ON discovered_urls(created_at DESC);
CREATE INDEX idx_discovered_urls_user_id ON discovered_urls(user_id);