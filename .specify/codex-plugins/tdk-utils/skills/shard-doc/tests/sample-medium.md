---
title: Sample Medium Document
tags: [test, sharding]
---

# Sample Medium Document

This is a medium-sized test document with varied content types, duplicate headings, Vietnamese text, and tilde-fenced code blocks to test edge cases.

## Setup

Initial setup instructions for the project. This section covers the basic configuration needed to get started with the application.

### Prerequisites

- Python 3.10+
- Git
- VS Code

### Installation

```bash
pip install -r requirements.txt
python setup.py install
```

Run the setup wizard:

```bash
python wizard.py --interactive
```

## Database Design

PostgreSQL chosen for ACID compliance. Schema uses normalized tables with foreign key constraints for referential integrity. The database layer handles all persistence concerns.

### Tables

| Table | Description | Columns |
|-------|-------------|---------|
| users | User accounts | id, email, name, created_at |
| orders | Purchase orders | id, user_id, total, status |
| items | Order line items | id, order_id, product_id, qty |

### Indexes

- `idx_users_email` on users(email) — unique
- `idx_orders_user_id` on orders(user_id) — foreign key lookup
- `idx_items_order_id` on items(order_id) — join performance

## API Endpoints

RESTful API with versioned routes under `/api/v1`. Authentication via JWT tokens with refresh flow. Rate limiting applied per-user with 100 req/min default.

### Routes

```
GET    /api/v1/users        — List users (paginated)
POST   /api/v1/users        — Create user
GET    /api/v1/users/:id    — Get user by ID
PUT    /api/v1/users/:id    — Update user
DELETE /api/v1/users/:id    — Delete user
```

### Authentication

JWT tokens with 15-minute expiry. Refresh tokens stored in httpOnly cookies.

## Setup

This is a DUPLICATE heading to test slug dedup. It covers deployment setup which is different from the initial setup above.

Deploy to production:

```bash
docker compose up -d
kubectl apply -f k8s/
```

Monitor health:
- Check `/health` endpoint
- Review Grafana dashboards
- Verify log aggregation

## Cơ sở dữ liệu

Phần này kiểm tra Unicode slugify với tiếng Việt. Cơ sở dữ liệu PostgreSQL được chọn cho tính tuân thủ ACID và hỗ trợ JSON mạnh mẽ.

### Bảng dữ liệu

- `nguoi_dung` — Tài khoản người dùng
- `don_hang` — Đơn đặt hàng
- `san_pham` — Sản phẩm

~~~python
## This Is A Fake Heading Inside Tilde Fence
# And another fake heading
def query_database():
    """This heading should NOT be detected as a real H2."""
    return db.execute("SELECT * FROM users")
~~~

Kết thúc phần cơ sở dữ liệu.
