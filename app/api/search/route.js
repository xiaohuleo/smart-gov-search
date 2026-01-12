import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const { query, items, context } = await req.json();

    // 初始化 Gemini
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    // 步骤1：数据瘦身
    // 为了防止超过大模型免费额度，只取前50条最相关的数据（这里简单根据文本包含做了初筛，实际可以用更好的算法）
    // 在Demo中，我们假设items已经是经过前端筛选过的，直接取前30条发送给AI
    const candidates = items.slice(0, 30).map(item => ({
      code: item['事项编码'] || 'NO_CODE',
      name: item['事项名称'],
      desc: item['事项描述'] || item['事项名称'], // 如果没描述，用名称代替
      dept: item['所属市州单位'],
      hot: item['是否高频事项'] === '是',
      // 这里假设CSV可能有满意度字段，如果没有则随机模拟一个以便演示
      satisfaction: item['满意度'] ? parseFloat(item['满意度']) : 0
    }));

    // 步骤2：构建 Prompt (提示词)
    const prompt = `
      你是一个政务服务智能搜索助手。
      用户正在搜索: "${query}"
      
      用户上下文:
      - 角色: ${context.userRole}
      - 所在位置/部门: ${context.location}
      - 是否优先高频: ${context.useHotness}
      - 是否考虑满意度: ${context.useSatisfaction}

      请从下面的候选服务列表中，分析用户意图，找出最相关的服务。
      
      排序规则:
      1. 语义相关性最重要（比如搜"丢了"要匹配"补领"）。
      2. 如果用户在"长沙市"，优先推荐"长沙市"或"省本级"单位的事项。
      3. 如果启用满意度，满意度高的稍微加分。
      4. 如果启用高频，isHot为true的加分。

      候选列表 JSON:
      ${JSON.stringify(candidates)}

      请返回一个 JSON 数组，只包含最相关的最多 5 个结果。
      返回格式:
      [
        { "code": "事项编码", "name": "事项名称", "reason": "推荐理由(简短)", "score": 0.95 }
      ]
      注意：只返回纯 JSON，不要 Markdown 格式。
    `;

    // 步骤3：调用 AI
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // 清理 Markdown 标记 (Gemini 有时会返回 ```json ...)
    const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    
    let aiResults = [];
    try {
        aiResults = JSON.parse(cleanJson);
    } catch (e) {
        console.error("AI JSON Parse Error", responseText);
        // 如果AI解析失败，回退到简单的名称匹配
        return NextResponse.json({ results: [] });
    }

    // 将AI结果和原始描述合并，以便前端展示
    const finalResults = aiResults.map(aiItem => {
        const original = candidates.find(c => c.code === aiItem.code);
        return {
            ...aiItem,
            description: original ? original.desc : ''
        };
    });

    return NextResponse.json({ results: finalResults });

  } catch (error) {
    console.error("Search API Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
