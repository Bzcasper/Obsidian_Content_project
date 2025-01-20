/*
  # Add logging system
  
  1. New Tables
    - `logs`
      - `id` (uuid, primary key)
      - `event` (text, required) - The type of event being logged
      - `details` (jsonb) - Additional event details/metadata
      - `created_at` (timestamp) - When the log was created
      - `user_id` (uuid) - Reference to the user who triggered the event
  
  2. Security
    - Enable RLS on `logs` table
    - Add policies for authenticated users to create and view logs
*/

CREATE TABLE logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  event text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  user_id uuid REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE logs ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can create logs"
  ON logs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own logs"
  ON logs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes
CREATE INDEX logs_event_idx ON logs(event);
CREATE INDEX logs_user_id_idx ON logs(user_id);
CREATE INDEX logs_created_at_idx ON logs(created_at);