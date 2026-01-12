import { NextResponse } from "next/server";

export const runtime = 'edge';

export async function POST(req) {
  try {
    const { query, candidates, config } = await req.json();

    if (!config.apiKey) return NextResponse.json({ error: "配置缺失" }, { status: 400 });

    const systemPrompt = `你是一个政务搜索专家。用户搜索: "${query}"。
    请对候选事项进行评分(0.0-1.0)。
    
    【核心原则：属性严格对齐】
    1. 用户如果指明了"姓名"，则只有处理"姓名"的事项能得高分。处理"住址"的事项得分必须低于 0.3。
    2. 用户如果指明了"丢了/补领"，则只有"补领"类事项得高分。"换领"类事项得分必须低于 0.5。
    
    【示例】
    用户: "身份证姓名错了"
    - "居民身份证姓名变更": 1.0 (完美)
    - "居民身份证住址变更": 0.2 (属性不符)
    - "居民身份证遗失补领": 0.1 (意图不符)
    
    返回 JSON: {"scores": {"ID": 0.9}}`;

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
