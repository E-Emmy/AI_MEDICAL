-- Creates (or repairs) the demo accounts used by the app (components/SignInGate.tsx), already
-- confirmed, each with its role. Run it in the Supabase SQL editor; it is safe to run again: an account
-- that already exists gets its password, confirmation and role reset, and nothing else is touched.
--   doctor@orbinova-demo.com, radiologist@orbinova-demo.com, student@orbinova-demo.com
--   password: OrbinovaDemo2026
do $$
declare
  r text;
  uid uuid;
  mail text;
begin
  foreach r in array array['doctor', 'radiologist', 'student'] loop
    mail := r || '@orbinova-demo.com';
    select id into uid from auth.users where email = mail;
    if uid is null then
      uid := gen_random_uuid();
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change, email_change_token_new
      ) values (
        '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', mail,
        extensions.crypt('OrbinovaDemo2026', extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}', jsonb_build_object('role', r), now(), now(),
        '', '', '', ''
      );
    else
      update auth.users set
        encrypted_password = extensions.crypt('OrbinovaDemo2026', extensions.gen_salt('bf')),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('role', r),
        banned_until = null,
        deleted_at = null,
        updated_at = now()
      where id = uid;
    end if;
    if not exists (select 1 from auth.identities where user_id = uid and provider = 'email') then
      insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (
        gen_random_uuid(), uid, uid::text,
        jsonb_build_object('sub', uid::text, 'email', mail, 'email_verified', true),
        'email', now(), now(), now()
      );
    end if;
  end loop;
end $$;
