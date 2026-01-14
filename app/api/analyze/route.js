import Groq from "groq-sdk";
import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    const { query, config } = await req.json();

    if (!query) return NextResponse.json({ error: "请输入搜索内容" }, { status: 400 });
    if (!config || !config.apiKey) return NextResponse.json({ error: "请配置 API Key" }, { status: 401 });

    // 构建客户端配置
    const clientConfig = {
      apiKey: config.apiKey,
      dangerouslyAllowBrowser: true // 允许在非Node环境运行(防止Vercel边缘函数报错)
    };

    // 如果是自定义模式，覆盖 baseURL
    if (config.provider === 'custom' && config.baseUrl) {
      clientConfig.baseURL = config.baseUrl;
    } 
    // 注意：Groq SDK 默认连接 https://api.groq.com/openai/v1，无需手动设置

    const groq = new Groq(clientConfig);

    const systemPrompt = `
      你是一个政务服务意图分析专家。请分析用户搜索内容，提取关键信息并以 JSON 格式返回。
      
      规则：
      1. keywords: 提取核心动作和名词，如果有同义词请一并列出。
      2. location: 如果提到具体湖南省内的城市或区县（如长沙、怀化、邵阳），请提取，否则为 "null"。
      3. role: 如果明确提到"公司"、"企业"返回 "法人"，提到"个人"、"我"返回 "自然人"，否则为 "null"。
      
      返回格式示例（纯JSON，不要Markdown）：
      { "keywords": ["疫苗", "接种"], "location": "null", "role": "自然人" }
    `;

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: query },
      ],
      model: config.model || "llama3-70b-8192", // 使用前端传来的模型名
      temperature: 0.1,
      response_format: { type: "json_object" },
    });

    let content = chatCompletion.choices[0]?.message?.content || "{}";
    
    // 清洗 Markdown 代码块
    content = content.replace(/```json\s*/g, "").replace(/```/g, "").trim();
    
    const intentData = JSON.parse(content);
    return NextResponse.json(intentData);

  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json({ error: "模型调用失败: " + error.message }, { status: 500 });
  }
}
