import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { TRANSCRIBE_MODEL } from "@/lib/models";
import { getAuthenticatedUser } from "@/lib/auth";

function getClient() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export async function POST(req: NextRequest) {
  try {
    getAuthenticatedUser(req); // ensure caller is authenticated
    const formData = await req.formData();
    const audioFile = formData.get("audio");
    if (!audioFile || !(audioFile instanceof File)) {
      return NextResponse.json({ error: "No audio file" }, { status: 400 });
    }

    const transcription = await getClient().audio.transcriptions.create({
      file: audioFile as File,
      model: TRANSCRIBE_MODEL,
      language: "en",
    });

    // Whisper hallucinates garbage characters on silence — filter them out
    const text = transcription.text?.trim() ?? "";
    if (!text || text.length < 2) {
      return NextResponse.json({ text: "" });
    }

    return NextResponse.json({ text });
  } catch (err) {
    console.error("[transcribe] error:", err);
    return NextResponse.json(
      { error: "Transcription failed" },
      { status: 500 }
    );
  }
}
