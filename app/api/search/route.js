import { NextResponse } from "next/server";

export const runtime = 'edge';

export async function POST(req) {
  try {
    const { query, candidates, config } = await req.json();

    if (!config.apiKey) return NextResponse.json({ error: "配置缺失: 请输入 API Key" }, { status: 400 });

    // 1. 优化 Prompt：强调“纯文本”返回，不要 Markdown
    const systemPrompt = `你是一个意图识别引擎。用户搜索: "${query}"。
    请判断候选事项名称与意图的相关性 (0.0-1.0)。
    评分: 1.0(完美), 0.8(强相关), 0.5(弱相关), 0.0(无关)。
    只判断语义，不要管地域和角色。
    请直接返回 JSON 字符串，不要包含 markdown 格式，不要说废话。
    格式示例: {"scores": {"ZW_001": 0.9, "ZW_002": 0.1}}`;

    const apiUrl = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`;

    // 2. 发起请求
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
        temperature: 0.1, // 低温度
        // 关键修复：移除 'response_format'，防止 API 因为一点点格式问题就报错
        // response_format: { type: "json_object" } 
      })
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      return NextResponse.json({ error: `模型服务报错 (${apiRes.status}): ${errText}` }, { status: apiRes.status });
    }

    const apiJson = await apiRes.json();
    
    if (!apiJson.choices || apiJson.choices.length === 0) {
      return NextResponse.json({ error: "模型返回结果为空" }, { status: 500 });
    }

    const rawContent = apiJson.choices[0].message.content;

    // 3. 暴力清洗与正则提取 (核心修复逻辑)
    // 不管 AI 返回什么，我们只提取第一个 { 和 最后一个 } 之间的内容
    let scores = {};
    try {
      // 移除 markdown 标记
      let cleanContent = rawContent.replace(/```json/g, '').replace(/```/g, '').trim();
      
      // 正则提取 JSON 部分 (防止 AI 说 "Here is the json: { ... }")
      const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanContent = jsonMatch[0];
      }

      const parsed = JSON.parse(cleanContent);
      scores = parsed.scores || parsed;
    } catch (e) {
      console.error("JSON解析失败，原始返回:", rawContent);
      // 如果真的解析不了，不要报错中断，而是返回空对象。
      // 这样用户依然能看到基于“角色+定位”排序的结果，只是没有 AI 加分而已。
      return NextResponse.json({ scores: {}, warning: "AI解析失败，降级为规则排序" });
    }

    return NextResponse.json({ scores });

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
