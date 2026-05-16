-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create rooms table
CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code TEXT UNIQUE NOT NULL,
  owner_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  movie_url TEXT,
  movie_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create playback_state table
CREATE TABLE IF NOT EXISTS playback_state (
  room_id UUID PRIMARY KEY REFERENCES rooms(id) ON DELETE CASCADE,
  is_playing BOOLEAN DEFAULT FALSE,
  playback_time FLOAT DEFAULT 0,
  updated_by UUID REFERENCES profiles(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  subtitle_url TEXT
);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE playback_state ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Anyone can view profiles" ON profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Rooms policies
CREATE POLICY "Anyone can view rooms" ON rooms
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create rooms" ON rooms
  FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Room owners can update rooms" ON rooms
  FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Room owners can delete rooms" ON rooms
  FOR DELETE USING (auth.uid() = owner_id);

-- Messages policies
CREATE POLICY "Anyone can view messages" ON messages
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can send messages" ON messages
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Playback state policies
CREATE POLICY "Anyone can view playback state" ON playback_state
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert playback state" ON playback_state
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Room owners can update playback state" ON playback_state
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM rooms WHERE rooms.id = playback_state.room_id AND rooms.owner_id = auth.uid()
    )
  );

-- Enable realtime for messages and playback_state
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE playback_state;
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;

-- Create storage bucket for movies
INSERT INTO storage.buckets (id, name, public) VALUES ('movies', 'movies', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Authenticated users can upload movies" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'movies' AND auth.uid() IS NOT NULL);

CREATE POLICY "Anyone can view movies" ON storage.objects
  FOR SELECT USING (bucket_id = 'movies');
