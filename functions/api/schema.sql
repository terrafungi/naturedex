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
