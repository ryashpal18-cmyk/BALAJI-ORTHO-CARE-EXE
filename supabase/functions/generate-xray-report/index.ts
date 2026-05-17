const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64, mimeType, patient } = await req.json();

    if (!imageBase64 || !mimeType) {
      return new Response(JSON.stringify({ error: "X-Ray image is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      throw new Error("AI service is not configured");
    }

    const now = new Date();
    const prompt = `You are a senior expert radiologist. Carefully analyze this medical X-ray/scan image and generate a COMPLETE, ACCURATE, DETAILED radiology report.

Patient: ${patient?.name || "Not provided"}, Age: ${patient?.age || "?"} years, Gender: ${patient?.gender || "Not provided"}
Body Region: ${patient?.bodyPart || "Not provided"}, Projection: ${patient?.view || "Not provided"}
Clinical History: ${patient?.clinicalHistory || "Not provided"}
Date: ${now.toISOString().slice(0, 10)}

Examine ALL visible anatomical structures carefully. Note every normal and abnormal finding with precise medical terminology. Be thorough like a senior radiologist.

Respond ONLY with valid JSON (no markdown, no extra text):
{"studyType":"Normal or Abnormal","bodyPartDetected":"string","urgency":"Routine or Urgent or Critical","technique":"string","clinicalIndication":"string","findings":{"overall":"string","bones":"string","softTissues":"string","specificFindings":"string","extraFindings":"string"},"impression":"string 3-5 lines","differentialDiagnosis":"string or None","recommendations":"string","urgentFindings":"string or None"}`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 2000,
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "AI rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits are required before generating more reports." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const message = await aiResponse.text();
      console.error("AI report error", aiResponse.status, message);
      throw new Error("AI report generation failed");
    }

    const data = await aiResponse.json();
    let text = data?.choices?.[0]?.message?.content || "";
    text = text.replace(/```json|```/g, "").trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("Invalid AI response");

    const report = JSON.parse(text.slice(start, end + 1));

    return new Response(JSON.stringify({ report }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});