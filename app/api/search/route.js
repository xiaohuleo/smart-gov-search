import { NextResponse } from "next/server";

export const runtime = 'edge';

export async function POST(req) {
  try {
    const { query, candidates, config } = await req.json();

    if (!config.apiKey) return NextResponse.json({ error: "配置缺失" }, { status: 400 });

    // 关键修改：System Prompt 只关注语义
    const systemPrompt = `你是一个政务服务意图识别引擎。
    用户搜索: "${query}"。
    请判断候选事项名称与搜索意图的【语义相关性】(0.0-1.0)。
    
    评分标准：
    - 1.0: 完美匹配 (如搜"身份证"出"居民身份证申领")
    - 0.8: 强相关 (如搜"生孩子"出"生育登记"、"医保")
    - 0.5: 弱相关 (包含关键词但意图不同，如搜"身份证"出"临时身份证")
    - 0.1: 仅字面重合 (如搜"企业"出"企业公园年票")
    - 0.0: 无关
    
    注意：只判断文本意图，【不要】考虑用户所在地或角色，这交给其他系统处理。
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
        response_format: { type: "json_object" }
      })
    });

    if (!apiRes.ok) throw new Error(apiRes.statusText);

    const apiJson = await apiRes.json();
    const content = apiJson.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim();
    
    let scores = {};
    try {
      const parsed = JSON.parse(content);
      scores = parsed.scores || parsed;
    } catch (e) {}

    return NextResponse.json({ scores });

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
