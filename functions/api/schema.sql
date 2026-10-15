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
    finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS quizzes_user_day ON quizzes (user_id, day);
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
