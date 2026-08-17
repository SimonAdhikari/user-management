# MySQL Setup — Social Hub Storage Server

The storage server's social data (posts, comments, likes, reactions, shares,
media metadata) now has a MySQL database layer. The running server still
uses the JSON store; the MySQL layer is ready to be plugged in.

## What was set up

| Item | Value |
|---|---|
| MySQL Server | 8.4.9 (installed via winget: `Oracle.MySQL`) |
| Binaries | `C:\Program Files\MySQL\MySQL Server 8.4\bin` |
| Data directory | `E:\oop\project\mysql_data` (project-local, no admin needed) |
| Config | `storage_server/my.ini` |
| Port | 3306 (bind 127.0.0.1) |
| Database | `social_hub` (utf8mb4) |
| App user | `social_hub` / `social_hub_pass` |
| Root password | `RootPass123!` |

## Tables

- `posts` — posts with denormalized author info, share counter, self-FK `repost_of_id`
- `post_media` — ordered media attachments (max 4 per post)
- `post_likes` — toggle likes (PK: post_id + user_id)
- `post_reactions` — Facebook-style reactions (ENUM: like/love/haha/wow/sad/angry)
- `comments` — threaded comments (self-FK `parent_id`)
- `comment_likes` — toggle likes on comments
- `media_files` — metadata for uploaded files (files stay on disk in `data/uploads`)

## Start / stop the server

```powershell
# Start (foreground, in its own terminal)
& "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysqld.exe" --defaults-file="E:\oop\project\storage_server\my.ini" --console

# Stop
& "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysqladmin.exe" -u root -p shutdown
```

## Apply schema / migrate data

```powershell
cd E:\oop\project\storage_server
python database.py init      # create database + tables (idempotent)
python database.py migrate   # one-time import of data/posts.json
```

## Configuration (env vars)

`MYSQL_HOST` (127.0.0.1), `MYSQL_PORT` (3306), `MYSQL_USER` (social_hub),
`MYSQL_PASSWORD` (social_hub_pass), `MYSQL_DATABASE` (social_hub).

## Using the layer

`database.py` exposes `MySQLPostStore` with the same operations as the JSON
store: `create_post`, `list_posts`, `get_post`, `delete_post`, `toggle_like`,
`react`, `share`, `add_comment`, `toggle_comment_like`, `edit_comment`,
`delete_comment`, `record_media_file`. To switch the server over, replace the
`store` object in `storage.py` with a `MySQLPostStore` instance and map the
route handlers to its methods.
