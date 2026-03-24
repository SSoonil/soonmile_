CREATE TABLE IF NOT EXISTS recommended_places (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    region VARCHAR(80) NOT NULL,
    description VARCHAR(800) NOT NULL,
    keywords TEXT NOT NULL DEFAULT '',
    image_url TEXT NOT NULL,
    is_visible BOOLEAN NOT NULL DEFAULT TRUE,
    is_sponsored BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_recommended_places_created_at
    ON recommended_places (created_at DESC);

INSERT INTO recommended_places (id, name, region, description, keywords, image_url, is_visible, is_sponsored, created_at, updated_at)
VALUES
    (
        'place-1',
        '제주 협재 해변',
        '제주',
        '노을 촬영 핫스팟 · 오후 6시 추천',
        '바다,노을,감성',
        'https://images.unsplash.com/photo-1505765050516-f72dcac9c60d?auto=format&fit=crop&w=1000&q=80',
        TRUE,
        TRUE,
        NOW(),
        NOW()
    ),
    (
        'place-2',
        '서울 북촌 한옥마을',
        '서울',
        '골목 스냅 포인트 다수',
        '도심,전통,골목',
        'https://images.unsplash.com/photo-1538485399081-7c897f4d9f72?auto=format&fit=crop&w=1000&q=80',
        TRUE,
        FALSE,
        NOW(),
        NOW()
    ),
    (
        'place-3',
        '부산 흰여울 문화마을',
        '부산',
        '바다 절벽길과 감성 카페 거리',
        '바다,감성,카페',
        'https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=1000&q=80',
        TRUE,
        TRUE,
        NOW(),
        NOW()
    ),
    (
        'place-4',
        '강릉 안목해변',
        '강릉',
        '커피거리 + 해변 산책 루트',
        '휴식,해변,커피',
        'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1000&q=80',
        TRUE,
        FALSE,
        NOW(),
        NOW()
    ),
    (
        'place-5',
        '전주 한옥마을',
        '전주',
        '야간 조명과 한복 스냅 포인트',
        '야경,전통,스냅',
        'https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=1000&q=80',
        TRUE,
        FALSE,
        NOW(),
        NOW()
    )
ON CONFLICT (id) DO NOTHING;
