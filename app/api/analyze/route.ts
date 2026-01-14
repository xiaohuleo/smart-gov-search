import { Groq } from "groq-sdk";
import { NextResponse } from "next/server";

// 初始化 Groq，这里会自动读取 Vercel 的环境变量
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || "", 
});

export async function POST(req: Request) {
  try {
    const { query } = await req.json();

    if (!query) {
      return NextResponse.json({ keywords: [] });
    }

    // --- 核心 Prompt (提示词) 设计 ---
    // 这个提示词专门用来解决“我要办XXX”搜不出“XXX证明”的问题
    const systemPrompt = `
      你是一个专业的政务服务搜索意图分析专家。
      任务：分析用户的自然语言搜索词，提取核心政务事项关键词，并扩展同义词。
      
      规则：
      1. 去除“我要”、“怎么”、“哪里”、“办理”等口语化动词。
      2. 识别核心名词，并扩展其政务规范用语。
         - 例如：“健康证” -> 扩展为 ["健康证", "健康证明", "从业人员体检"]
         - 例如：“开店” -> 扩展为 ["营业执照", "个体工商户注册", "企业开办"]
         - 例如：“社保” -> 扩展为 ["社会保险", "社保查询", "参保登记"]
      3. 必须只返回一个 JSON 对象，格式为：{"keywords": ["词1", "词2", "词3"]}
    `;

    const completion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `用户搜索词："${query}"` },
      ],
      model: "llama3-70b-8192", // 使用 Groq 上速度快且效果好的模型
      response_format: { type: "json_object" },
      temperature: 0.3, // 低随机性，保证结果准确
    });

    const content = completion.choices[0]?.message?.content;
    let result;
    
    try {
      result = JSON.parse(content || '{"keywords": []}');
    } catch (e) {
      // 如果模型偶尔没返回标准JSON，做个兜底
      result = { keywords: [query] };
    }
    
    // 如果AI提取为空，至少把原词返回去
    if (!result.keywords || result.keywords.length === 0) {
      result.keywords = [query];
    }

    return NextResponse.json(result);

  } catch (error) {
    console.error("AI Analysis Error:", error);
    // 发生错误时（比如Key没填），降级为直接返回原词，保证系统不崩
    return NextResponse.json({ keywords: [query] });
  }
}
