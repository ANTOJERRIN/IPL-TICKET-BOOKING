import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://ekzbogqincreulkobqoz.supabase.co";
const supabaseKey = "sb_publishable_BpgZ7NViJioj-Zyd7ITwwg_vn-g0_sx";

export const supabase = createClient(
  supabaseUrl,
  supabaseKey
);
