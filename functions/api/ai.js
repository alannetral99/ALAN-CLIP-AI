

// ALAN SMART CLIP AI - Cloudflare Pages Functions
// Workers AI binding: AI

const j = (o, s = 200) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: { "content-type": "application/json" }
  });

export async function onRequestPost({ request, env }) {
  if (!env.AI) {
    return j({
      error: "Binding Workers AI (nama: AI) belum dipasang di Cloudflare."
    }, 500);
  }

  let b;
  try {
    b = await request.json();
  } catch {
    return j({ error: "Permintaan tidak valid." }, 400);
  }

  try {
    if (b.action === "transcribe") {
      const r = await env.AI.run(
        "@cf/openai/whisper-large-v3-turbo",
        {
          audio: b.audio,
          ...(b.lang ? { language: b.lang } : {})
        }
      );

      const words = (r.words || [])
        .map(x => ({
          w: String(x.word || "").trim(),
          s: x.start,
          e: x.end
        }))
        .filter(x => x.w);

      const segs = (r.segments || [])
        .map(x => ({
          s: x.start,
          e: x.end,
          t: String(x.text || "").trim()
        }))
        .filter(x => x.t);

      return j({
        text: r.text || "",
        words,
        segs
      });
    }

    if (b.action === "pick") {
      const len = Number(b.len) || 30;

      const prompt =
        `Kamu editor video pendek (TikTok/Reels/Shorts). Dari transkrip berikut (format [detik] teks), ` +
        `pilih 3 momen paling menarik untuk klip berdurasi ${len} detik. Aturan: mulai di awal kalimat, ` +
        `ketiga klip tidak boleh tumpang tindih, total video ${b.dur} detik. ` +
        `Buat judul singkat dan hook pembuka (maks 8 kata, bahasa sama dengan transkrip, memancing penasaran). ` +
        `Balas HANYA JSON valid tanpa teks lain: ` +
        `{"clips":[{"start":<detik>,"title":"...","hook":"...","score":<1-100>}]}\n\n` +
        String(b.transcript || "").slice(0, 12000);

      const r = await env.AI.run(
        "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
        {
          messages: [{ role: "user", content: prompt }],
          max_tokens: 700
        }
      );

      const txt = String(r.response || "");
      const m = txt.match(/\{[\s\S]*\}/);

      let clips = [];
      try {
        clips = JSON.parse(m ? m[0] : "{}").clips || [];
      } catch {}

      return j({ clips });
    }

    return j({ error: "Aksi tidak dikenal." }, 400);

  } catch (e) {
    return j({
      error: "AI gagal: " + (e && e.message ? e.message : e)
    }, 500);
  }
}
