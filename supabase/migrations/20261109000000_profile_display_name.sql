ALTER TABLE public.profiles
  ADD COLUMN display_name text NOT NULL UNIQUE
    CHECK ( char_length(display_name) > 0 AND char_length(display_name) < 31 )
    CHECK ( lower(btrim(display_name)) = display_name );

create or replace function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as
$$
begin
  if jsonb_typeof(NEW.raw_user_meta_data -> 'display_name') is distinct from 'string' then
    raise exception 'Имя должно быть строкой';
  end if;

  insert into public.profiles (id, display_name)
  values (new.id, lower(btrim(new.raw_user_meta_data ->> 'display_name')));

  return new;
end;
$$;




