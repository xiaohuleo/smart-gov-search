import { NextResponse } from "next/server";

export const runtime = 'edge';

export async function POST(req) {
  try {
    const { query, candidates, config } = await req.json();

    if (!config.apiKey) return NextResponse.json({ error: "配置缺失" }, { status: 400 });

    const systemPrompt = `你是一个严谨的政务意图判别器。
用户搜索: "${query}"
请对候选列表(名称+描述)进行相关性打分(0.0-1.0)。

【判分核心原则】：关注“动作”和“意图”，而不仅仅是名词匹配。

1. **精确匹配 (0.9 - 1.0)**: 
   - 动作和核心名词都对。
   - 例子: 搜"身份证丢了"，匹配"身份证遗失补领"。

2. **强相关但意图不符 (0.4 - 0.6) [重要!]**:
   - 核心名词对(都是身份证)，但动作不对(换领/变更/有效期满)。
   - 例子: 搜"身份证丢了"，遇到"身份证住址变更换领"，只能给 0.5 分，不能更高！因为用户没搬家。

3. **弱相关 (0.1 - 0.3)**:
   - 仅包含部分关键词。

请返回 JSON 字符串: {"scores": {"ID": 0.95}}`;

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
      return NextResponse.json({ error: `API Error: ${errText}` }, { status: apiRes.status });
    }

    const apiJson = await apiRes.json();
    
    if (!apiJson.choices || apiJson.choices.length === 0) {
      return NextResponse.json({ error: "Empty AI response" }, { status: 500 });
    }

    const rawContent = apiJson.choices[0].message.content;

    // 宽松解析逻辑
    let scores = {};
    try {
      let cleanContent = rawContent.replace(/```json/g, '').replace(/```/g, '').trim();
      const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) cleanContent = jsonMatch[0];
      
      const parsed = JSON.parse(cleanContent);
      scores = parsed.scores || parsed;
    } catch (e) {
      return NextResponse.json({ scores: {}, warning: "AI Parsing Failed" });
    }

    return NextResponse.json({ scores });

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
