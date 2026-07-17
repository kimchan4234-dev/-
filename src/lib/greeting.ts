/**
 * Claude 공식처럼 현재 시간·요일·기상에 따라 맞춤형 인사말을 반환합니다.
 */

// 시간대별 기본 인사
function timeOfDayGreeting(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 7) return "사용자님, 아침이 되었어요 🌅";
  if (h >= 7 && h < 9) return "사용자님, 좋은 아침이에요 ☀️";
  if (h >= 9 && h < 12) return "사용자님, 좋은 오전이에요";
  if (h >= 12 && h < 14) return "사용자님, 따뜻한 오후예요 🌤️";
  if (h >= 14 && h < 17) return "사용자님, 화이팅하세요 💪";
  if (h >= 17 && h < 19) return "사용자님, 퇴근 시간이에요 🏠";
  if (h >= 19 && h < 22) return "사용자님, 좋은 저녁이에요";
  if (h >= 22 && h < 24) return "사용자님, 늦은 밤이에요 🌙";
  return "사용자님, 새벽이 조용하네요 🌌";
}

// 요일별 인사
function dayOfWeekGreeting(): string {
  const d = new Date().getDay(); // 0=일, 1=월 …
  const days = [
    "사용자님, 주말의 시작이에요 🎉",
    "사용자님, 새로운 주의 시작이에요 ",
    "사용자님, 화요일에 화이팅 💪",
    "사용자님, 수요일에 활기차세요 🌈",
    "사용자님, 목요일이 코앞이에요 ✨",
    "사용자님, 즐거운 금요일이에요 🎊",
    "사용자님, 주말을 만끽하세요 🎉",
  ];
  return days[d];
}

/**
 * 무료 기상 API로 현재 날씨를 가져와 인사말을 만듭니다.
 * 실패 시 시간대·요일 인사로 폴백합니다.
 */
export async function fetchGreeting(): Promise<string> {
  try {
    const geo = await fetch("https://ipapi.co/json/").then((r) => r.json());
    if (geo.latitude && geo.longitude) {
      const wt = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${geo.latitude}&longitude=${geo.longitude}&current_weather=true&timezone=auto`,
      ).then((r) => r.json());
      if (wt.current_weather) {
        const code = wt.current_weather.weathercode;
        const hour = new Date().getHours();
        const period = hour >= 12 ? "오후" : "오전";

        if (code >= 61 && code <= 65 || code === 80 || code === 81 || code === 82 || code === 95) {
          return `사용자님, 비가 오는 ${period}이에요 🌧️`;
        }
        if (code >= 71 && code <= 75 || code === 85 || code === 86) {
          return `사용자님, 눈이 오는 ${period}이에요 ❄️`;
        }
        if (code === 0 || code === 1) {
          return `사용자님, 해가 떴어요 ☀️`;
        }
      }
    }
  } catch {
    // ignore
  }

  // 금요일이나 주말이면 요일 인사 우선
  const day = new Date().getDay();
  if (day === 5 || day === 6 || day === 0) return dayOfWeekGreeting();
  return timeOfDayGreeting();
}
