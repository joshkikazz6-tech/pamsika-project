import asyncio
from app.db.session import AsyncSessionLocal
from app.models.user import User
from app.core.security import hash_password
from sqlalchemy import select

async def fix():
    async with AsyncSessionLocal() as db:
        async with db.begin():
            r = await db.execute(select(User).where(User.email == 'admin@pamsika.mw'))
            u = r.scalar_one_or_none()
            if u:
                u.password_hash = hash_password('@p-A-m-$-1-k-a.com')
                print('Password updated successfully!')
            else:
                print('Admin user not found')

asyncio.run(fix())