import { NextResponse } from "next/server";

export const runtime = 'edge';

export async function POST(req) {
  try {
    const { query, candidates, config } = await req.json();

    if (!config.apiKey) return NextResponse.json({ error: "配置缺失" }, { status: 400 });

    // 优化提示词：要求 AI 拉开分差
    const systemPrompt = `你是一个政务搜索评分专家。用户搜索: "${query}"。
    请判断以下候选事项与搜索意图的相关性 (0.00 - 1.00)。
    评分标准：
    - 核心意图完全匹配 (如搜"生孩子"出"出生证"): > 0.9
    - 意图相关 (如搜"生孩子"出"医保"): 0.5 - 0.8
    - 仅字面相关但意图不符: < 0.3
    - 完全无关: 0.0
    必须返回 JSON: {"scores": {"编码": 0.95}}。`;

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
        temperature: 0.0, // 0温度确保结果最稳定
        response_format: { type: "json_object" }
      })
    });

    if (!apiRes.ok) throw new Error(apiRes.statusText);

    const apiJson = await apiRes.json();
    const content = apiJson.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim();
    
    let scores = {};
    try {
      const parsed = JSON.parse(cleanContent);
      scores = parsed.scores || parsed;
    } catch (e) {
      // 容错处理
    }

    return NextResponse.json({ scores });

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
