// Vision AI analyzer using Gemini 2.5 Flash API or Local Mock fallback
class VisionAI {
  constructor() {
    this.storageKey = 'godsaeng_api_key';
    this.conscienceKey = 'godsaeng_last_conscience_date';
  }

  // Get saved API Key
  getApiKey() {
    return localStorage.getItem(this.storageKey) || '';
  }

  // Save API Key
  saveApiKey(key) {
    if (key.trim()) {
      localStorage.setItem(this.storageKey, key.trim());
      return true;
    }
    return false;
  }

  // Delete API Key
  deleteApiKey() {
    localStorage.removeItem(this.storageKey);
  }

  // Real Gemini API analysis (Vision)
  async analyzeWithGemini(apiKey, missionText, base64Image) {
    // Strip Base64 header if exists
    const base64Data = base64Image.replace(/^data:image\/(png|jpeg|webp|jpg);base64,/, "");
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    
    const prompt = `당신은 갓생 살기 앱의 깐깐하고 위트 있는 AI 감독관입니다. 유저가 입력한 미션 주제와 촬영된 사진(부메랑 움짤의 대표 프레임)이 일치하는지 분석해야 합니다.

유저가 제출한 미션: "${missionText}"

다음 조건에 맞게 JSON 형식으로만 응답하세요. 다른 텍스트는 앞뒤에 절대 추가하지 마세요. 마크다운 기호(\`\`\`json)도 적지 말고 순수 JSON만 반환하세요.

응답 JSON 스키마:
{
  "score": 0~100 사이의 정수 (미션과 사진 속 맥락이 일치하는지 판별한 점수. 관련 물건(책, 필기구, 모니터, 덤벨, 운동화 등)이 보이면 높은 점수, 빈 방이나 어두운 화면, 관련 없는 사진은 낮은 점수),
  "pass": score가 70점 이상이면 true, 미만이면 false,
  "feedback": "성공 시(pass=true)에는 힙하고 유머러스하게 칭찬하는 멘트(예: '형광펜 그어진 거 보소. 진짜 갓생러 인정! 🔥'), 실패 시(pass=false)에는 유머러스하고 얄미운 팩폭 피드백(예: '침대 이불 덮고 공부하는 거 맞음? 눈 반쯤 감겼는데 다시 찍어오셈. 🙄')을 1~2문장의 한국어로 친근한 구어체(~함, ~임, 반말 등 MZ 톤앤매너 권장)로 작성"
}`;

    const requestBody = {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: base64Data
              }
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json"
      }
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `API HTTP Error ${response.status}`);
      }

      const result = await response.json();
      const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!responseText) {
        throw new Error("API 응답 구조가 올바르지 않습니다.");
      }

      // Parse JSON from text
      const parsedData = JSON.parse(responseText.trim());
      return {
        success: true,
        score: parsedData.score ?? 50,
        pass: parsedData.pass ?? false,
        feedback: parsedData.feedback || "판독 중 알 수 없는 외계 신호가 감지됨 🛸"
      };
    } catch (error) {
      console.error("Gemini API Error:", error);
      return {
        success: false,
        error: error.message,
        feedback: `Gemini API 오류 발생: ${error.message}. 임시 Mock AI 결과로 대체합니다.`
      };
    }
  }

  // Mock Vision AI System with keyword match and funny messages
  analyzeWithMock(missionText) {
    const text = missionText.toLowerCase();
    
    // Key words lists
    const isStudy = /공부|책|인강|코딩|독서|단어|과제|시험|배움|스터디|개발|코드|노트|필기|영어/.test(text);
    const isWorkout = /운동|헬스|런닝|달리기|산책|푸쉬업|스쿼트|홈트|바이크|필라테스|요가|스트레칭|득근|아령/.test(text);
    const isClean = /청소|정리|빨래|설거지|정돈|물걸레|분리수거|이불/.test(text);
    const isMorning = /미라클|일찍|기상|일어나기|아침|새벽|물/.test(text);

    // Default Mock Responses (75% Chance of Pass)
    const isPass = Math.random() > 0.25;
    const score = isPass ? Math.floor(Math.random() * 25) + 75 : Math.floor(Math.random() * 35) + 30; // 75~99 or 30~65

    let feedback = "";

    if (isStudy) {
      feedback = isPass 
        ? `"${missionText}" 미션 확인 완료! 펜 잡은 손가락에 소름 돋는 집중력이 서려 있네요. 갓생 ㅇㅈ! ✍️🔥`
        : `공부한다더니 펜은 데코레이션이고 사실 스마트폰 쳐다보는 중 맞죠? AI는 다 봅니다. 똑바로 찍으셈 🙄`;
    } else if (isWorkout) {
      feedback = isPass
        ? `와, 근손실 방지 위원회에서 합격 목걸이 줬습니다. 땀방울마저 힙해 보이는 중! 🏋️✨`
        : `운동 자세가 좀 엉성하거나, 그냥 운동기구 옆에 누워있는 거 아닙니까? 득근하고 싶으면 다시 제대로 인증 ㄱ`;
    } else if (isClean) {
      feedback = isPass
        ? `방이 너무 깨끗해서 파리가 낙상하겠습니다. 갓생러의 품격이 느껴지는 청소 본능! 🧹🧼`
        : `정리를 하긴 했는데... 구석에 대충 처박아 둔 거 아닙니까? AI 필터에 게으름 레이더 켜짐 🚨`;
    } else if (isMorning) {
      feedback = isPass
        ? `남들 꿈나라일 때 눈 번쩍 뜬 당신, 진정한 얼리버드! 오늘 하루가 엄청 길겠네요 🔥`
        : `이불 속에 누운 채로 눈만 깜빡인 건 아니겠죠? 기상이란 몸을 일으켜 세우는 것임! 다시!`;
    } else {
      // General Mission Responses
      feedback = isPass
        ? `오, 딱 봐도 갓생의 기운이 모니터를 뚫고 나옴. 이 텐션 그대로 오늘 하루 클리어 해보자고! 🚀`
        : `미션 "${missionText}"... 양심적으로 지금 제대로 한 거 맞음? 딴짓하는 실루엣 다 걸림. 다시 해오셈! 🙄`;
    }

    return {
      success: true,
      score: score,
      pass: isPass,
      feedback: feedback
    };
  }

  // Combined Main Entry
  async analyze(missionText, base64Image) {
    const apiKey = this.getApiKey();
    
    // Add artificial delay for AI analysis feel (1.5s)
    await new Promise(resolve => setTimeout(resolve, 1500));

    if (apiKey) {
      const result = await this.analyzeWithGemini(apiKey, missionText, base64Image);
      if (result.success) {
        return result;
      }
      // If real API failed, fallback to mock (with error logged in feedback)
      const mockResult = this.analyzeWithMock(missionText);
      mockResult.feedback = `[Gemini Error: ${result.error}]\n${mockResult.feedback}`;
      return mockResult;
    } else {
      // Direct Mock Mode
      return this.analyzeWithMock(missionText);
    }
  }
}

// Instantiate globally
window.visionAI = new VisionAI();
