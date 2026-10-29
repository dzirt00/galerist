-- Minimal contract stand-in, not Supabase Realtime: no sockets or delivery.
-- Captures SQL send arguments transactionally and exercises our real RLS policy.
CREATE SCHEMA realtime;
CREATE TABLE realtime.messages (
  topic text, extension text, event text, payload jsonb, private boolean
);
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA realtime TO authenticated, anon, service_role;
GRANT SELECT ON realtime.messages TO authenticated, anon;
CREATE FUNCTION realtime.topic() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT current_setting('test.realtime.topic', true);
$$;
CREATE FUNCTION realtime.send(payload jsonb, event text, topic text, private boolean DEFAULT true)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO realtime.messages(topic, extension, event, payload, private)
  VALUES (topic, 'broadcast', event, payload, private);
$$;
REVOKE EXECUTE ON FUNCTION realtime.send(jsonb, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION realtime.send(jsonb, text, text, boolean) TO service_role;
