import { createClient } from '@supabase/supabase-js';
import { createLocalAuth, createLocalRepo } from '../data/localRepo';
import type { AuthClient, Repo } from '../data/repo';
import { createSupabaseAuth, createSupabaseRepo } from '../data/supabaseRepo';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** True when no Supabase project is configured: data stays in this browser only. */
export const isDemo = !url || !anonKey;

const supabase = url && anonKey ? createClient(url, anonKey) : null;

export const repo: Repo = supabase ? createSupabaseRepo(supabase) : createLocalRepo();
export const auth: AuthClient = supabase ? createSupabaseAuth(supabase) : createLocalAuth();
