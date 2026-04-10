import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
    if (!ELEVENLABS_API_KEY) {
      throw new Error('ELEVENLABS_API_KEY is not configured');
    }

    const { text, voiceId } = await req.json();

    if (!text || typeof text !== 'string' || text.length > 1000) {
      return new Response(JSON.stringify({ error: 'Invalid text parameter' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const cleanedText = text
      .replace(/[\x00-\x1F\x7F]/g, '')
      .replace(/[\uD800-\uDFFF]/g, '')
      .replace(/[^\p{L}\p{N}\p{P}\p{Z}\p{S}]/gu, '')
      .trim();

    const selectedVoice = voiceId || 'EXAVITQu4vr4xnSDxMaL';

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoice}?output_format=mp3_22050_32`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: cleanedText,
          model_id: 'eleven_turbo_v2_5',
          voice_settings: {
            stability: 0.6,
            similarity_boost: 0.75,
            style: 0.3,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`ElevenLabs API error [${response.status}]:`, errorBody);

      const isFallbackable = response.status === 429 || response.status >= 500;

      if (isFallbackable) {
        return new Response(
          JSON.stringify({ error: 'SERVICE_UNAVAILABLE', fallback: true }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      return new Response(
        JSON.stringify({ error: `API error: ${response.status}` }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const audioBuffer = await response.arrayBuffer();

    return new Response(audioBuffer, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'audio/mpeg',
      },
    });
  } catch (error: unknown) {
    console.error('TTS error:', error);
    return new Response(
      JSON.stringify({ error: 'SERVICE_FAILED', fallback: true }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
