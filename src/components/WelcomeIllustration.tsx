/** 홈 화면의 서비스 안내 그림. 실제 제보나 AI 결과가 아닌 직접 그린 장식용 거리·신고 준비 예시입니다. */
export default function WelcomeIllustration() {
  return (
    <div className="sr-hero-art" aria-hidden="true">
      <div className="sr-art-orbit" />
      <div className="sr-art-label">
        <span />
        우리 동네를 살피는 작은 시작
      </div>
      <svg className="sr-town-art" viewBox="0 0 460 360" fill="none">
        <defs>
          <linearGradient
            id="town-blue"
            x1="80"
            y1="40"
            x2="330"
            y2="300"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#DCE8FF" />
            <stop offset="1" stopColor="#A9C4F4" />
          </linearGradient>
          <linearGradient
            id="pin-blue"
            x1="220"
            y1="70"
            x2="280"
            y2="200"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#5C81FF" />
            <stop offset="1" stopColor="#315CE8" />
          </linearGradient>
          <filter id="town-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow
              dx="0"
              dy="10"
              stdDeviation="10"
              floodColor="#33588F"
              floodOpacity=".13"
            />
          </filter>
        </defs>
        <path d="m25 212 211-115 201 109-211 119L25 212Z" fill="#E5EDFA" />
        <path
          d="m65 193 164 88M132 149l164 90M199 113l164 89M105 251l193-108M173 290l191-108"
          stroke="white"
          strokeWidth="15"
        />
        <path d="m25 212 201 113v10L25 222v-10Z" fill="#D3E0F2" />
        <path d="m226 325 211-119v10L226 335v-10Z" fill="#DBE6F7" />
        <g filter="url(#town-shadow)">
          <path d="m92 164 44-25 46 26-44 26-46-27Z" fill="#F4F8FF" />
          <path d="M92 164v-66l46 26v67l-46-27Z" fill="#C2D5F3" />
          <path d="m138 124 44-25v66l-44 26v-67Z" fill="#A9C1E6" />
          <path d="m92 98 44-25 46 26-44 25-46-26Z" fill="url(#town-blue)" />
          <path
            d="m103 116 12 7v15l-12-7v-15Zm19 11 9 5v15l-9-5v-15Zm-19 17 12 7v15l-12-7v-15Zm19 11 9 5v15l-9-5v-15Z"
            fill="#F1F7FF"
          />
          <path
            d="m149 130 19-11v17l-19 11v-17Zm0 30 19-11v17l-19 11v-17Z"
            fill="#DCEAFF"
          />
        </g>
        <g filter="url(#town-shadow)">
          <path d="m292 126 39-23 42 24-39 23-42-24Z" fill="#E4EDFC" />
          <path d="M292 126V58l42 24v68l-42-24Z" fill="#B4CCEF" />
          <path d="m334 82 39-23v68l-39 23V82Z" fill="#95B4E1" />
          <path d="m292 58 39-23 42 24-39 23-42-24Z" fill="#DFEAFB" />
          <path
            d="m303 77 18 10v20l-18-10V77Zm0 30 18 10v20l-18-10v-20Zm40-21 18-10v20l-18 10V86Zm0 30 18-10v20l-18 10v-20Z"
            fill="#EAF3FF"
          />
        </g>
        <path d="m281 247 37-21 42 24-37 22-42-25Z" fill="#BDE1D6" />
        <path
          d="M302 243v-23"
          stroke="#71A58E"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <ellipse cx="302" cy="213" rx="15" ry="21" fill="#8BC1A7" />
        <path
          d="M337 250v-16"
          stroke="#71A58E"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <ellipse cx="337" cy="228" rx="12" ry="17" fill="#A2D0B5" />
        <g filter="url(#town-shadow)">
          <path
            d="M225 74c-26 0-47 21-47 47 0 34 47 75 47 75s47-41 47-75c0-26-21-47-47-47Z"
            fill="url(#pin-blue)"
          />
          <circle cx="225" cy="121" r="25" fill="white" />
          <path
            d="M225 109v15"
            stroke="#4770F5"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <circle cx="225" cy="133" r="2.5" fill="#4770F5" />
        </g>
        <path d="m63 243 28-16 31 17-28 17-31-18Z" fill="#D0E8E0" />
        <ellipse cx="91" cy="224" rx="12" ry="17" fill="#8FBEA9" />
        <path
          d="M91 242v-9"
          stroke="#70A389"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </svg>
      <div className="sr-art-note">
        <span className="sr-art-note-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path
              d="M7 8 9 5h6l2 3h3v12H4V8h3Z"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinejoin="round"
            />
            <circle
              cx="12"
              cy="13"
              r="3"
              stroke="currentColor"
              strokeWidth="1.7"
            />
          </svg>
        </span>
        <div>
          <strong>발견한 위험을 사진으로</strong>
          <span>신고처 안내부터 신고문 작성까지</span>
        </div>
        <span className="sr-art-note-check">✓</span>
      </div>
      <span className="sr-art-caption">
        서비스 이용 흐름을 표현한 안내 그림입니다
      </span>
    </div>
  );
}
