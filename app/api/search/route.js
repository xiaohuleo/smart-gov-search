import { NextResponse } from "next/server";

export const runtime = 'edge';

export async function POST(req) {
  try {
    const { query, candidates, config } = await req.json();

    if (!config.apiKey) return NextResponse.json({ error: "配置缺失: 请输入 API Key" }, { status: 400 });

    const systemPrompt = `你是一个意图识别引擎。用户搜索: "${query}"。
    请判断候选事项名称与意图的相关性 (0.0-1.0)。
    评分: 1.0(完美), 0.8(强相关), 0.5(弱相关), 0.0(无关)。
    只判断语义，不要管地域和角色。
    返回JSON: {"scores": {"ID": 0.9}}`;

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

    // 修复：显式捕获上游错误并透传给前端
    if (!apiRes.ok) {
      const errText = await apiRes.text();
      // 尝试解析错误信息中的 message
      try {
        const errJson = JSON.parse(errText);
        return NextResponse.json({ error: errJson.error?.message || errText }, { status: apiRes.status });
      } catch (e) {
        return NextResponse.json({ error: `模型服务报错: ${apiRes.status}` }, { status: apiRes.status });
      }
    }

    const apiJson = await apiRes.json();
    
    // 修复：增加防御性编程，防止 choices 不存在导致 500
    if (!apiJson.choices || apiJson.choices.length === 0) {
      return NextResponse.json({ error: "模型返回结果为空" }, { status: 500 });
    }

    const content = apiJson.choices[0].message.content.replace(/```json/g, '').replace(/```/g, '').trim();
    
    let scores = {};
    try {
      const parsed = JSON.parse(content);
      scores = parsed.scores || parsed;
    } catch (e) {
      console.error("JSON解析失败", content);
      // 如果解析失败，不报错，而是返回空分，依赖硬规则排序
    }

    return NextResponse.json({ scores });

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
