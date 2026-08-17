-- ============================================================================
-- Social Hub — MySQL schema for the storage server
-- ----------------------------------------------------------------------------
-- Covers: posts, post media, likes, Facebook-style reactions, shares,
--         threaded comments, comment likes, and uploaded-file metadata.
--
-- Design notes:
--   * IDs stay as VARCHAR(40) so existing POST_xxx / CMT_xxx identifiers
--     from the JSON store migrate without changes.
--   * author_name / author_role are denormalized on posts and comments
--     because user accounts live in the separate main-backend store.
--   * repost_of_id is a self-referencing FK; the API "repost_of" snapshot
--     is reconstructed with a JOIN (see database.py).
--   * utf8mb4 so emoji reactions and unicode post bodies are safe.
--   * body/author_name columns are sized for AES-GCM tokens (plaintext +
--     ~37% overhead), since sensitive fields are encrypted at rest.
-- ============================================================================

CREATE DATABASE IF NOT EXISTS social_hub
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE social_hub;

-- ---------------------------------------------------------------------------
-- Posts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS posts (
  id            VARCHAR(40)   NOT NULL,
  author_id     VARCHAR(40)   NOT NULL,
  author_name   VARCHAR(200)  NOT NULL,
  author_role   VARCHAR(40)   NOT NULL,
  body          VARCHAR(4000) NOT NULL,
  share_count   INT UNSIGNED  NOT NULL DEFAULT 0,
  repost_of_id  VARCHAR(40)   NULL,
  created_at    DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  CONSTRAINT fk_posts_repost
    FOREIGN KEY (repost_of_id) REFERENCES posts (id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  INDEX idx_posts_author (author_id),
  INDEX idx_posts_created (created_at DESC)
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------------
-- Post media attachments (up to 4 per post, ordered by position)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS post_media (
  id         INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  post_id    VARCHAR(40)      NOT NULL,
  url        VARCHAR(500)     NOT NULL,
  kind       ENUM('image','video') NOT NULL,
  mime_type  VARCHAR(80)      NOT NULL,
  filename   VARCHAR(200)     NOT NULL DEFAULT '',
  position   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  CONSTRAINT fk_media_post
    FOREIGN KEY (post_id) REFERENCES posts (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX idx_media_post (post_id)
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------------
-- Simple post likes (toggle: one row per user per post)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS post_likes (
  post_id    VARCHAR(40)  NOT NULL,
  user_id    VARCHAR(40)  NOT NULL,
  created_at DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (post_id, user_id),
  CONSTRAINT fk_likes_post
    FOREIGN KEY (post_id) REFERENCES posts (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------------
-- Facebook-style reactions (one per user per post; changing replaces the row)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS post_reactions (
  post_id    VARCHAR(40)  NOT NULL,
  user_id    VARCHAR(40)  NOT NULL,
  reaction   ENUM('like','love','haha','wow','sad','angry') NOT NULL,
  created_at DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (post_id, user_id),
  CONSTRAINT fk_reactions_post
    FOREIGN KEY (post_id) REFERENCES posts (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX idx_reactions_type (post_id, reaction)
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------------
-- Threaded comments (parent_id NULL = top-level comment)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comments (
  id          VARCHAR(40)   NOT NULL,
  post_id     VARCHAR(40)   NOT NULL,
  parent_id   VARCHAR(40)   NULL,
  author_id   VARCHAR(40)   NOT NULL,
  author_name VARCHAR(200)  NOT NULL,
  author_role VARCHAR(40)   NOT NULL,
  body        VARCHAR(2000) NOT NULL,
  edited      TINYINT(1)    NOT NULL DEFAULT 0,
  created_at  DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  CONSTRAINT fk_comments_post
    FOREIGN KEY (post_id) REFERENCES posts (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_comments_parent
    FOREIGN KEY (parent_id) REFERENCES comments (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX idx_comments_post (post_id),
  INDEX idx_comments_parent (parent_id)
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------------
-- Comment likes (toggle: one row per user per comment)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comment_likes (
  comment_id VARCHAR(40)  NOT NULL,
  user_id    VARCHAR(40)  NOT NULL,
  created_at DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (comment_id, user_id),
  CONSTRAINT fk_clikes_comment
    FOREIGN KEY (comment_id) REFERENCES comments (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------------
-- Uploaded file metadata (files themselves stay on disk in data/uploads)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS media_files (
  stored_name   VARCHAR(100)     NOT NULL,
  original_name VARCHAR(200)     NOT NULL DEFAULT '',
  kind          ENUM('image','video') NOT NULL,
  mime_type     VARCHAR(80)      NOT NULL,
  size_bytes    BIGINT UNSIGNED  NOT NULL DEFAULT 0,
  created_at    DATETIME(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (stored_name)
) ENGINE = InnoDB;
