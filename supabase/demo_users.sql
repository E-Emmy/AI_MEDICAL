-- Creates the three demo accounts used by the sign-in box (components/SignInGate.tsx), already
-- confirmed, each with its role. Run it once in the Supabase SQL editor; running it again does nothing.
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
    if exists (select 1 from auth.users where email = mail) then
      continue;
    end if;
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
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (
      gen_random_uuid(), uid, uid::text,
      jsonb_build_object('sub', uid::text, 'email', mail, 'email_verified', true),
      'email', now(), now(), now()
    );
  end loop;
end $$;
