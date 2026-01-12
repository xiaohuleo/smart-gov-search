import { NextResponse } from "next/server";

export const runtime = 'edge';

export async function POST(req) {
  try {
    const { query, candidates, config } = await req.json();

    if (!config.apiKey) return NextResponse.json({ error: "配置缺失" }, { status: 400 });

    const systemPrompt = `你是一个严厉的政务意图识别引擎。用户搜索: "${query}"。
    请判断候选事项与意图的相关性 (0.0 - 1.0)。
    
    【判分标准】
    1. **完全无关 (0.0)**: 如搜"身份证"遇到"血压管理"、"疫苗"。必须给 0.0！
    2. **动作不符 (0.2)**: 搜"改名"遇到"查询"。虽然名词对，但动作不对，低分。
    3. **相关 (0.5)**: 泛泛的相关。
    4. **精准 (1.0)**: 名词和动作都完美匹配。

    返回 JSON: {"scores": {"CODE": 0.0}}`;

    const apiUrl = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`;

    const apiRes = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(candidates) }
        ],
        temperature: 0.0,
      })
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      return NextResponse.json({ error: errText }, { status: apiRes.status });
    }

    const apiJson = await apiRes.json();
    
    if (!apiJson.choices || apiJson.choices.length === 0) {
      return NextResponse.json({ error: "Empty Response" }, { status: 500 });
    }

    const rawContent = apiJson.choices[0].message.content;

    let scores = {};
    try {
      let cleanContent = rawContent.replace(/```json/g, '').replace(/```/g, '').trim();
      const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) cleanContent = jsonMatch[0];
      const parsed = JSON.parse(cleanContent);
      scores = parsed.scores || parsed;
    } catch (e) {
      return NextResponse.json({ scores: {}, warning: "Parse Fail" });
    }

    return NextResponse.json({ scores });

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
