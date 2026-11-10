-- NatureDex schema (idempotent)

CREATE TABLE IF NOT EXISTS cards (
    id          SERIAL PRIMARY KEY,
    qid         TEXT UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    sci_name    TEXT,
    type        TEXT NOT NULL,
    rarity      TEXT NOT NULL DEFAULT 'common',
    views       BIGINT NOT NULL DEFAULT 0,
    image_url   TEXT NOT NULL,
    thumb_url   TEXT NOT NULL,
    extract     TEXT,
    wiki_url    TEXT NOT NULL,
    iucn        TEXT,
    stats       JSONB NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE cards ADD COLUMN IF NOT EXISTS num INTEGER;
CREATE INDEX IF NOT EXISTS cards_num_idx ON cards (num);
-- special artwork: 'full' = full-art (the photo fills the card), 'illus' = illustrated variant
-- of the species base_id (painted artwork, extra card next to the Wikipédia one),
-- 'holo' = holographic foil (some commons / uncommons), 'gold' = all-gold card (some rares and up)
ALTER TABLE cards ADD COLUMN IF NOT EXISTS art TEXT;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS base_id INTEGER REFERENCES cards(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS cards_rarity_idx ON cards (rarity);
CREATE INDEX IF NOT EXISTS cards_type_idx ON cards (type);

CREATE TABLE IF NOT EXISTS users (
    id          SERIAL PRIMARY KEY,
    username    TEXT UNIQUE NOT NULL,
    pass_hash   TEXT NOT NULL,
    coins       INTEGER NOT NULL DEFAULT 0,
    boosters    INTEGER NOT NULL DEFAULT 3,
    last_daily  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
    token       TEXT PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at  TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS user_cards (
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    card_id     INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    count       INTEGER NOT NULL DEFAULT 1,
    first_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, card_id)
);
-- who owns a card: the biome check gives players' cards their biome first
CREATE INDEX IF NOT EXISTS user_cards_card_idx ON user_cards (card_id);

CREATE TABLE IF NOT EXISTS openings (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    card_ids    INTEGER[] NOT NULL,
    at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- daily challenges already rewarded (day = Europe/Paris calendar day)
CREATE TABLE IF NOT EXISTS challenge_claims (
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day         DATE NOT NULL,
    key         TEXT NOT NULL,
    at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, day, key)
);

-- Two currencies: users.coins = « graines » (booster openings only), users.nuggets = « pépites »
-- (auction house). Free booster charges: `charges` as of `charges_at`, +1 every 30 min up to 10.
ALTER TABLE users ADD COLUMN IF NOT EXISTS nuggets INTEGER NOT NULL DEFAULT 200;
ALTER TABLE users ADD COLUMN IF NOT EXISTS charges INTEGER NOT NULL DEFAULT 10;
ALTER TABLE users ADD COLUMN IF NOT EXISTS charges_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE users ADD COLUMN IF NOT EXISTS recycled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ALTER COLUMN boosters SET DEFAULT 0;

-- permanent achievements already rewarded
CREATE TABLE IF NOT EXISTS trophy_claims (
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key         TEXT NOT NULL,
    at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, key)
);

-- auction house: the listed copy leaves user_cards (escrow) until the auction is settled;
-- the high bid is debited from the bidder and refunded when outbid.
CREATE TABLE IF NOT EXISTS auctions (
    id          SERIAL PRIMARY KEY,
    seller_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    card_id     INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    start_price INTEGER NOT NULL,
    buyout      INTEGER,
    bid         INTEGER,
    bidder_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    bids        INTEGER NOT NULL DEFAULT 0,
    status      TEXT NOT NULL DEFAULT 'open', -- open | sold | expired | cancelled
    ends_at     TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    settled_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS auctions_open_idx ON auctions (ends_at) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS auctions_seller_idx ON auctions (seller_id);

CREATE TABLE IF NOT EXISTS auction_bids (
    auction_id  INTEGER NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount      INTEGER NOT NULL,
    at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auction_bids_user_idx ON auction_bids (user_id, auction_id);

-- Friends: one row per pair, requester → addressee, pending until accepted.
CREATE TABLE IF NOT EXISTS friendships (
    requester_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    addressee_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    accepted_at TIMESTAMPTZ,
    PRIMARY KEY (requester_id, addressee_id),
    CHECK (requester_id <> addressee_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS friendships_pair ON friendships (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));
CREATE INDEX IF NOT EXISTS friendships_addressee ON friendships (addressee_id);

-- Card trades between friends. Cards stay with their owners until the trade is accepted.
CREATE TABLE IF NOT EXISTS trades (
    id SERIAL PRIMARY KEY,
    from_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS trades_to ON trades (to_id, status);
CREATE INDEX IF NOT EXISTS trades_from ON trades (from_id, status);
CREATE TABLE IF NOT EXISTS trade_items (
    trade_id INT NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
    owner_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    card_id INT NOT NULL REFERENCES cards(id),
    qty INT NOT NULL DEFAULT 1 CHECK (qty > 0),
    PRIMARY KEY (trade_id, owner_id, card_id)
);

-- Daily quiz: questions (with answers) stay on the server; the browser gets one at a time.
CREATE TABLE IF NOT EXISTS quizzes (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day DATE NOT NULL,
    theme TEXT NOT NULL,
    questions JSONB NOT NULL,
    answers JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{ choice, correct, late, ms }]
    current INT NOT NULL DEFAULT 0,
    asked_at TIMESTAMPTZ, -- when the current question was shown (timer start)
    score INT NOT NULL DEFAULT 0,
    coins INT NOT NULL DEFAULT 0,
    nuggets INT NOT NULL DEFAULT 0,
    reward_card INT REFERENCES cards(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'done')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,
    mode TEXT NOT NULL DEFAULT 'classic', -- classic | daily | survival | blitz
    lives INT, -- survival only
    points INT NOT NULL DEFAULT 0, -- game score: level, speed and combo
    combo INT NOT NULL DEFAULT 0,
    best_combo INT NOT NULL DEFAULT 0,
    jokers JSONB NOT NULL DEFAULT '{}'::jsonb, -- jokers left: { fifty, time, skip }
    reserve JSONB, -- spare question swapped in by the "skip" joker (classic, daily)
    cur JSONB NOT NULL DEFAULT '{}'::jsonb, -- jokers on the current question: { removed, extraMs, fifty }
    ends_at TIMESTAMPTZ -- blitz: end of the whole game
);
CREATE INDEX IF NOT EXISTS quizzes_user_day ON quizzes (user_id, day);
CREATE INDEX IF NOT EXISTS quizzes_mode_day ON quizzes (mode, day) WHERE status = 'done';
-- Daily challenge: the same questions for every player on a given day.
CREATE TABLE IF NOT EXISTS quiz_daily (
    day DATE PRIMARY KEY,
    questions JSONB NOT NULL,
    reserve JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- species a player already met in a quiz, so new quizzes favour unseen ones
CREATE TABLE IF NOT EXISTS quiz_seen (
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    card_id INT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, card_id)
);

-- Real-money shop (Stripe Checkout). 20 % of each paid amount is set aside for the
-- association the buyer picked; rows are kept even if the account is deleted (accounting).
CREATE TABLE IF NOT EXISTS purchases (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    username TEXT NOT NULL,
    pack TEXT NOT NULL,
    amount_cents INT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'eur',
    donation_cents INT NOT NULL,
    association TEXT NOT NULL,
    coins INT NOT NULL DEFAULT 0,
    nuggets INT NOT NULL DEFAULT 0,
    stripe_session TEXT UNIQUE,
    stripe_payment TEXT,
    livemode BOOLEAN NOT NULL DEFAULT false,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'expired')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    paid_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS purchases_user ON purchases (user_id, created_at DESC);

-- Invitations: each player gets a code; a new account signed up with it records its sponsor.
-- The sponsor's reward is claimed once the invitee has played on INVITE_DAYS different days.
ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_code TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS invited_by INT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_rewarded_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_share DATE;
CREATE INDEX IF NOT EXISTS users_invited_by ON users (invited_by);

-- Private messages between friends. read_at is set when the recipient opens the thread.
CREATE TABLE IF NOT EXISTS messages (
    id BIGSERIAL PRIMARY KEY,
    from_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    read_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS messages_pair ON messages (LEAST(from_id, to_id), GREATEST(from_id, to_id), id);
CREATE INDEX IF NOT EXISTS messages_unread ON messages (to_id) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS messages_from ON messages (from_id, created_at);

-- Battles. `arena` holds the player's team (also their defence in ranked fights), their
-- rating and their campaign progress; `battles` the full deterministic state of each fight.
CREATE TABLE IF NOT EXISTS arena (
    user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    team        INTEGER[] NOT NULL DEFAULT '{}',
    rating      INTEGER NOT NULL DEFAULT 1000,
    wins        INTEGER NOT NULL DEFAULT 0,
    losses      INTEGER NOT NULL DEFAULT 0,
    campaign    INTEGER NOT NULL DEFAULT 0,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS arena_rating ON arena (rating);

CREATE TABLE IF NOT EXISTS battles (
    id            BIGSERIAL PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mode          TEXT NOT NULL,
    stage         INTEGER,
    opponent_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    opponent_name TEXT NOT NULL,
    opponent_rating INTEGER,
    state         JSONB NOT NULL,
    status        TEXT NOT NULL DEFAULT 'active',
    reward        JSONB,
    rating_delta  INTEGER,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at      TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS battles_one_active ON battles (user_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS battles_user_ended ON battles (user_id, ended_at DESC);

-- Daily battle cap: battles started beyond the free ones are paid in nuggets.
ALTER TABLE battles ADD COLUMN IF NOT EXISTS paid BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS battles_user_created ON battles (user_id, created_at DESC);

-- Monthly arena seasons (YYYY-MM, Paris time). The rollover ranks everyone, stores the
-- rewards to claim, then resets ratings.
CREATE TABLE IF NOT EXISTS arena_season (
    id      INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    current TEXT NOT NULL
);
INSERT INTO arena_season (id, current) VALUES (1, to_char(now() AT TIME ZONE 'Europe/Paris', 'YYYY-MM')) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS season_results (
    season     TEXT NOT NULL,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rank       INTEGER NOT NULL,
    rating     INTEGER NOT NULL,
    wins       INTEGER NOT NULL,
    losses     INTEGER NOT NULL,
    coins      INTEGER NOT NULL,
    nuggets    INTEGER NOT NULL,
    claimed_at TIMESTAMPTZ,
    PRIMARY KEY (season, user_id)
);
CREATE INDEX IF NOT EXISTS season_results_user ON season_results (user_id) WHERE claimed_at IS NULL;

-- Favourites: player-named binders ("Plantes", "Mes requins"…); a card can sit in several.
CREATE TABLE IF NOT EXISTS binders (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS binders_user ON binders (user_id);
CREATE TABLE IF NOT EXISTS binder_cards (
    binder_id INTEGER NOT NULL REFERENCES binders(id) ON DELETE CASCADE,
    card_id   INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    added_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (binder_id, card_id)
);

-- Garden: graines are planted in plots and harvested as « plantes » (10 open a booster).
ALTER TABLE users ADD COLUMN IF NOT EXISTS plants INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS plots INTEGER NOT NULL DEFAULT 3;
CREATE TABLE IF NOT EXISTS garden_plots (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    slot       SMALLINT NOT NULL,
    kind       TEXT NOT NULL,
    planted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ready_at   TIMESTAMPTZ NOT NULL,
    watered    BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (user_id, slot)
);

-- Daily conversion bonus: the first Grainerie conversion of the (Paris) day gives +50 % graines.
ALTER TABLE users ADD COLUMN IF NOT EXISTS convert_bonus_at TIMESTAMPTZ;

-- Gifts: friends can give each other graines, pépites or plantes, within daily limits.
CREATE TABLE IF NOT EXISTS gifts (
    id BIGSERIAL PRIMARY KEY,
    from_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    currency TEXT NOT NULL,
    amount INT NOT NULL CHECK (amount > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gifts_from_idx ON gifts (from_id, created_at);
CREATE INDEX IF NOT EXISTS gifts_to_idx ON gifts (to_id, created_at);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS gift BOOLEAN NOT NULL DEFAULT false;

-- Gift notices: the receiver sees a pop-up for each gift until seen_at is set.
ALTER TABLE gifts ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE gifts ADD COLUMN IF NOT EXISTS seen_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS gifts_unseen_idx ON gifts (to_id) WHERE seen_at IS NULL;

-- Showcases: one shareable "vitrine" per player (up to 10 cards on a drawn background).
CREATE TABLE IF NOT EXISTS showcases (user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, title TEXT NOT NULL DEFAULT '', background TEXT NOT NULL DEFAULT 'foret', layout TEXT NOT NULL DEFAULT 'grille', format TEXT NOT NULL DEFAULT 'story', card_ids INT[] NOT NULL DEFAULT '{}', updated_at TIMESTAMPTZ NOT NULL DEFAULT now());

-- Premium showcase backgrounds bought with pépites.
CREATE TABLE IF NOT EXISTS showcase_backgrounds (user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE, background TEXT NOT NULL, bought_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (user_id, background));

-- Blog: one sourced nature article per day, written by the scheduler from Wikipédia / RSS material.
CREATE TABLE IF NOT EXISTS blog_posts (
    id           SERIAL PRIMARY KEY,
    status       TEXT NOT NULL DEFAULT 'generating', -- generating | published | failed
    category     TEXT NOT NULL,
    day          DATE,                               -- Paris day of a daily post (NULL for the launch batch)
    slug         TEXT UNIQUE,
    title        TEXT,
    description  TEXT,
    excerpt      TEXT,
    body         JSONB,
    sources      JSONB NOT NULL DEFAULT '[]'::jsonb,
    image_url    TEXT,
    image_alt    TEXT,
    image_credit TEXT,
    card_ids     INT[] NOT NULL DEFAULT '{}',
    tags         TEXT[] NOT NULL DEFAULT '{}',
    source_key   TEXT UNIQUE,
    error        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS blog_one_generating ON blog_posts ((true)) WHERE status = 'generating';
CREATE UNIQUE INDEX IF NOT EXISTS blog_one_per_day ON blog_posts (day) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS blog_published_idx ON blog_posts (published_at DESC) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS blog_category_idx ON blog_posts (category, published_at DESC) WHERE status = 'published';

-- Vitrines publiques
CREATE TABLE IF NOT EXISTS showcase_votes (
    voter_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (voter_id, owner_id)
);
CREATE INDEX IF NOT EXISTS showcase_votes_owner_idx ON showcase_votes (owner_id, created_at);
CREATE INDEX IF NOT EXISTS showcase_votes_voter_idx ON showcase_votes (voter_id, created_at);
ALTER TABLE users ADD COLUMN IF NOT EXISTS hide_donations BOOLEAN NOT NULL DEFAULT false;

-- Concours vitrines
-- One row per finished Paris week (Monday), so the weekly prize is handed out exactly once.
CREATE TABLE IF NOT EXISTS showcase_weeks (
    week    DATE PRIMARY KEY,
    done_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS showcase_awards (
    week       DATE NOT NULL,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rank       INTEGER NOT NULL,
    votes      INTEGER NOT NULL,
    nuggets    INTEGER NOT NULL,
    claimed_at TIMESTAMPTZ,
    PRIMARY KEY (week, user_id)
);
CREATE INDEX IF NOT EXISTS showcase_awards_unclaimed_idx ON showcase_awards (user_id) WHERE claimed_at IS NULL;

-- Concours quiz
-- Same as the showcase contest: the 3 players with the most quiz points over the Paris week win pépites.
CREATE TABLE IF NOT EXISTS quiz_weeks (
    week    DATE PRIMARY KEY,
    done_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS quiz_awards (
    week       DATE NOT NULL,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rank       INTEGER NOT NULL,
    points     INTEGER NOT NULL,
    nuggets    INTEGER NOT NULL,
    claimed_at TIMESTAMPTZ,
    PRIMARY KEY (week, user_id)
);
CREATE INDEX IF NOT EXISTS quiz_awards_unclaimed_idx ON quiz_awards (user_id) WHERE claimed_at IS NULL;

-- Nouveautés
-- Id of the last « Nouveautés » pop-up the player closed (shown once per account, on any device).
ALTER TABLE users ADD COLUMN IF NOT EXISTS news_seen TEXT;

-- public species pages: group listings and "nearby in popularity" links
CREATE INDEX IF NOT EXISTS cards_type_views_idx ON cards (type, views);

-- species pages: original fiche written from the full Wikipédia articles (FR + EN) when the intro is too short
CREATE TABLE IF NOT EXISTS species_texts (
    card_id     INTEGER PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE,
    status      TEXT NOT NULL DEFAULT 'working', -- working | ok | thin | failed | quota
    attempts    INTEGER NOT NULL DEFAULT 0,
    body        JSONB,
    sources     JSONB,
    model       TEXT,
    error       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS species_texts_status_idx ON species_texts (status, updated_at);

-- « Sur le terrain »: players photograph real species; the AI identifies them and the confirmed
-- photo becomes a personal field card. status: pending (waiting for the player's choice) |
-- confirmed | replaced (a better photo took its place) | hidden (reported) | deleted
CREATE TABLE IF NOT EXISTS observations (
    id          BIGSERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    card_id     INTEGER REFERENCES cards(id) ON DELETE CASCADE,
    status      TEXT NOT NULL DEFAULT 'pending',
    photo_key   TEXT NOT NULL,
    candidates  JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{ id, confidence }] proposed by the AI
    captive     BOOLEAN NOT NULL DEFAULT false,
    region      TEXT,
    lat         REAL,
    lon         REAL,
    sha256      TEXT NOT NULL,
    dhash       TEXT,
    number      INTEGER,                              -- n-th confirmed observation of this species
    first_ever  BOOLEAN NOT NULL DEFAULT false,
    reward      INTEGER NOT NULL DEFAULT 0,
    gave_card   BOOLEAN NOT NULL DEFAULT false,
    model       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    confirmed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS observations_user_idx ON observations (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS observations_card_idx ON observations (card_id, confirmed_at DESC) WHERE status = 'confirmed';
CREATE INDEX IF NOT EXISTS observations_feed_idx ON observations (confirmed_at DESC) WHERE status = 'confirmed';
CREATE INDEX IF NOT EXISTS observations_sha_idx ON observations (sha256);
CREATE INDEX IF NOT EXISTS observations_dhash_idx ON observations (dhash);
-- one field card per species and player
CREATE UNIQUE INDEX IF NOT EXISTS observations_one_per_species ON observations (user_id, card_id) WHERE status = 'confirmed';

-- every identification request, including rejected photos (daily AI limit)
CREATE TABLE IF NOT EXISTS field_attempts (
    id          BIGSERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    outcome     TEXT NOT NULL,
    reason      TEXT,
    at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS field_attempts_user_idx ON field_attempts (user_id, at DESC);

CREATE TABLE IF NOT EXISTS field_reports (
    observation_id BIGINT NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (observation_id, user_id)
);

-- « Exploration »: GBIF taxon of each card (species pools around the player)
ALTER TABLE cards ADD COLUMN IF NOT EXISTS gbif_key INTEGER;
CREATE INDEX IF NOT EXISTS cards_gbif_idx ON cards (gbif_key);

-- land-cover shares of each ~200 m grid cell (ESA WorldCover), computed once
CREATE TABLE IF NOT EXISTS explore_cells (
    cell        TEXT PRIMARY KEY,
    cover       JSONB NOT NULL,
    at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- cards really recorded around each ~5 km cell (GBIF): { cardId: weight }, refreshed after 60 days
CREATE TABLE IF NOT EXISTS explore_pools (
    cell        TEXT PRIMARY KEY,
    cards       JSONB NOT NULL,
    at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- one row per player and spawn: throws used, caught or not
CREATE TABLE IF NOT EXISTS explore_catches (
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    spawn       TEXT NOT NULL,
    card_id     INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    habitat     TEXT,
    tries       INTEGER NOT NULL DEFAULT 0,
    caught      BOOLEAN NOT NULL DEFAULT false,
    at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, spawn)
);
ALTER TABLE explore_catches ADD COLUMN IF NOT EXISTS perfect BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS explore_catches_day_idx ON explore_catches (user_id, at DESC) WHERE caught;
-- only the last known position (speed check), never a track
CREATE TABLE IF NOT EXISTS explore_positions (
    user_id     INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    lat         DOUBLE PRECISION NOT NULL,
    lon         DOUBLE PRECISION NOT NULL,
    at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    cooldown_until TIMESTAMPTZ
);

-- Pass Naturaliste (Stripe subscription): perks while pass_until is in the future
ALTER TABLE users ADD COLUMN IF NOT EXISTS pass_sub TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pass_until TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pass_cancel BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pass_association TEXT;
CREATE INDEX IF NOT EXISTS users_pass_sub ON users (pass_until) WHERE pass_sub IS NOT NULL;

-- Avatar: a drawn character ({ skin, hair, hairColor, acc, bg, shirt }); null = generated from the username
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar JSONB;
-- paid t-shirts bought with pépites (free ones are never stored)
CREATE TABLE IF NOT EXISTS user_shirts (
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    shirt       TEXT NOT NULL,
    price       INTEGER NOT NULL,
    bought_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, shirt)
);

-- Avatar items in five slots (shirt, hat, face, neck, pet), keyed "slot:id"; replaces user_shirts.
CREATE TABLE IF NOT EXISTS user_items (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item TEXT NOT NULL,
    price INTEGER NOT NULL,
    bought_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, item)
);
INSERT INTO user_items (user_id, item, price, bought_at)
    SELECT user_id, 'shirt:' || shirt, price, bought_at FROM user_shirts ON CONFLICT DO NOTHING;
-- The old single "acc" field moves to its slot.
UPDATE users SET avatar = (avatar - 'acc') || jsonb_build_object(
    'hat', CASE WHEN avatar->>'acc' IN ('casquette', 'explorateur', 'bandana', 'fleur') THEN avatar->>'acc' ELSE 'aucun' END,
    'face', CASE WHEN avatar->>'acc' = 'lunettes' THEN 'lunettes' ELSE 'aucun' END,
    'neck', CASE WHEN avatar->>'acc' = 'jumelles' THEN 'jumelles' ELSE 'aucun' END,
    'pet', 'aucun')
WHERE avatar ? 'acc';

-- Rewarded ads: a server token per ad view, claimable once after a minimum watch time (1 bonus booster, capped per Paris day).
CREATE TABLE IF NOT EXISTS ad_views (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    claimed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ad_views_user_claimed ON ad_views (user_id, claimed_at);

-- Card source: 'frwiki' (build-catalog.mjs, fr.wikipedia articles) or 'wikispecies' (import-wikispecies.mjs:
-- Wikispecies taxa with a photo and an English article, intro translated to French on first view).
ALTER TABLE cards ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'frwiki';

-- Jardin 2.0: garden level, grange, orders, hive, decorations, daily quests and caps.
CREATE TABLE IF NOT EXISTS garden_meta (
    user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    xp         INTEGER NOT NULL DEFAULT 0,
    level      SMALLINT NOT NULL DEFAULT 1,
    compost    INTEGER NOT NULL DEFAULT 0,
    fertilizer INTEGER NOT NULL DEFAULT 0,
    honey      INTEGER NOT NULL DEFAULT 0,
    barn       JSONB NOT NULL DEFAULT '{}',
    orders     JSONB NOT NULL DEFAULT '[]',
    decor      JSONB NOT NULL DEFAULT '[]',
    daily      JSONB NOT NULL DEFAULT '{}',
    best       JSONB NOT NULL DEFAULT '{}'
);
ALTER TABLE garden_plots ADD COLUMN IF NOT EXISTS pest_at TIMESTAMPTZ;
ALTER TABLE garden_plots ADD COLUMN IF NOT EXISTS pest_gone BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE garden_plots ADD COLUMN IF NOT EXISTS fertilized BOOLEAN NOT NULL DEFAULT false;

-- « Pendant ton absence » pop-up: events after notices_seen_at are shown once (NULL = the last 7 days);
-- invite_ready_seen = referral rewards already announced, so an unclaimed one is not shown again.
ALTER TABLE users ADD COLUMN IF NOT EXISTS notices_seen_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_ready_seen INTEGER NOT NULL DEFAULT 0;

-- Card game (« Duel »): Énergie and Naturaliste cards owned (key 'e:foret', 't:darwin'…),
-- and each duel against the AI with its full state (hidden deck order included).
CREATE TABLE IF NOT EXISTS tcg_cards (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key        TEXT NOT NULL,
    count      INTEGER NOT NULL DEFAULT 0,
    first_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, key)
);
CREATE TABLE IF NOT EXISTS duels (
    id            BIGSERIAL PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    level         INTEGER NOT NULL,
    opponent_name TEXT NOT NULL,
    state         JSONB NOT NULL,
    status        TEXT NOT NULL DEFAULT 'active',
    reward        JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at      TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS duels_one_active ON duels (user_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS duels_user_ended ON duels (user_id, ended_at DESC);

-- The deck a player saved in the deck editor (card keys, duplicates repeated).
CREATE TABLE IF NOT EXISTS tcg_decks (
    user_id    integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    keys       text[] NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Binder sub-folders: one level under a main binder (deleting the main one deletes them too).
ALTER TABLE binders ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES binders(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS binders_parent ON binders (parent_id) WHERE parent_id IS NOT NULL;
