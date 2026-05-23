"""
Seed script — populates DB with admin user + all 22 Pa_mSikA products.
Runs automatically on first docker-compose up, safe to re-run (idempotent).
"""

import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import select
import app.db.base  # noqa — registers all models
from app.db.base import Base
from app.models.user import User
from app.models.product import Product
from app.core.config import settings
from app.core.security import hash_password

ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@pamsika.mw")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")
ADMIN_NAME = "Pa_mSikA Admin"

PRODUCTS = [
    {"name":"Toyota Hilux Double Cab 4x4","price":28500000.0,"category":"Automobiles","subcategory":"Cars","location":"Lilongwe","images":["https://images.unsplash.com/photo-1625047509252-ab38fb5c7343?w=800&q=80","https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&q=80"],"commission_percent":5.0,"badge":"HOT","description":"Well-maintained 2021 Toyota Hilux Double Cab 4x4, diesel automatic. Full service history, 45,000 km. Bull bar, tow bar, canopy included."},
    {"name":"Ankara Print Dress - Gold Collection","price":85000.0,"category":"Fashion","subcategory":"Women","location":"Blantyre","images":["https://images.unsplash.com/photo-1612336307429-8a898d10e223?w=800&q=80","https://images.unsplash.com/photo-1520975954732-35dd22299614?w=800&q=80"],"commission_percent":5.0,"badge":"NEW","description":"Handcrafted Ankara print dress, Kente-inspired fabric. Gold and black patterns. Sizes S-2XL. Perfect for weddings and ceremonies."},
    {"name":"3-Bedroom Executive House - Area 43","price":85000000.0,"category":"Real Estate","subcategory":"Houses for sale","location":"Lilongwe","images":["https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800&q=80","https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80"],"commission_percent":5.0,"badge":"HOT","description":"Stunning executive home in Area 43. 3 bedrooms, 2 bathrooms, open-plan kitchen. Electric gate, borehole, solar backup. Instant occupation."},
    {"name":"Samsung 65 QLED Smart TV 4K","price":1950000.0,"category":"Electronics","subcategory":"Home gadgets","location":"Lilongwe","images":["https://images.unsplash.com/photo-1571415060716-baff5f717c37?w=800&q=80","https://images.unsplash.com/photo-1593359677879-a4bb92f829e1?w=800&q=80"],"commission_percent":5.0,"badge":"NEW","description":"Brand new Samsung 65 QLED 4K Smart TV. Tizen OS, Netflix, YouTube. 4 HDMI. 2-year warranty. Delivery available in Lilongwe."},
    {"name":"Honda CBR 600 Motorcycle 2020","price":9200000.0,"category":"Automobiles","subcategory":"Motorcycles","location":"Blantyre","images":["https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80","https://images.unsplash.com/photo-1609630875171-b1321377ee65?w=800&q=80"],"commission_percent":5.0,"badge":None,"description":"2020 Honda CBR 600RR, 18,000 km. Full fairing, upgraded exhaust, LED lighting. Spare parts kit and helmet included."},
    {"name":"Chitenge Fabric Bundle - 10 Yards","price":45000.0,"category":"Fashion","subcategory":"Accessories","location":"Zomba","images":["https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=800&q=80","https://images.unsplash.com/photo-1503342564462-3cc2fd1f7da0?w=800&q=80"],"commission_percent":5.0,"badge":"NEW","description":"Premium Chitenge fabric bundle, 10 yards of vibrant Malawian Chitenge, mixed prints. Colourfast dyes. Wholesale for bulk orders."},
    {"name":"Commercial Plot 1200m2 - Salima","price":42000000.0,"category":"Real Estate","subcategory":"Land","location":"Blantyre","images":["https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=800&q=80","https://images.unsplash.com/photo-1558618047-3c8c76ca7d13?w=800&q=80"],"commission_percent":5.0,"badge":None,"description":"Prime commercial land on Salima Lakeshore Road. 1,200sqm, fenced, electricity connection. Title deeds ready."},
    {"name":"iPhone 15 Pro Max 256GB","price":1680000.0,"category":"Electronics","subcategory":"Phones","location":"Lilongwe","images":["https://images.unsplash.com/photo-1695048133142-1a20484bce71?w=800&q=80","https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=800&q=80"],"commission_percent":5.0,"badge":"HOT","description":"Apple iPhone 15 Pro Max 256GB, Titanium Blue. Sealed box. Apple warranty valid. 48MP Pro camera, A17 Pro chip."},
    {"name":"Hand-Beaded African Necklace Set","price":28000.0,"category":"Fashion","subcategory":"Accessories","location":"Mzuzu","images":["https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=800&q=80","https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=800&q=80"],"commission_percent":5.0,"badge":None,"description":"Authentic handcrafted beaded set by local artisans. Seed beads, bone, semi-precious stones. Necklace, bracelet, earrings."},
    {"name":"Mazda CX-5 SUV 2022","price":31500000.0,"category":"Automobiles","subcategory":"Cars","location":"Lilongwe","images":["https://images.unsplash.com/photo-1617469767108-a422e3e42b1b?w=800&q=80","https://images.unsplash.com/photo-1590362891991-f776e747a588?w=800&q=80"],"commission_percent":5.0,"badge":None,"description":"One-owner 2022 Mazda CX-5 AWD Pearl White. Full leather, panoramic sunroof, Bose audio, 360 cameras. 38,000 km."},
    {"name":"Solar Power System 3kW Complete","price":2800000.0,"category":"Electronics","subcategory":"Home gadgets","location":"Lilongwe","images":["https://images.unsplash.com/photo-1509391366360-2e959784a276?w=800&q=80","https://images.unsplash.com/photo-1497435334941-8c899ee9e8e9?w=800&q=80"],"commission_percent":5.0,"badge":"HOT","description":"Complete 3kW off-grid solar. 6x500W panels, 5kW inverter, 200Ah lithium. Installation included in Lilongwe. 5-year warranty."},
    {"name":"Studio Apartment - Area 12","price":12500000.0,"category":"Real Estate","subcategory":"Houses for rent","location":"Lilongwe","images":["https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&q=80","https://images.unsplash.com/photo-1560448204-603b3fc33ddc?w=800&q=80"],"commission_percent":5.0,"badge":"NEW","description":"Modern studio in secure complex. Open-plan, fitted kitchen. 24hr security, parking, borehole. Walk to Old Town Mall."},
    {"name":"Mens Kente Suit - Premium Tailored","price":195000.0,"category":"Fashion","subcategory":"Men","location":"Blantyre","images":["https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&q=80","https://images.unsplash.com/photo-1617127365659-c47fa864d8bc?w=800&q=80"],"commission_percent":5.0,"badge":None,"description":"Tailored mens suit in Kente-inspired fabric. Two-piece blazer and trousers. Custom tailoring 7 days. Sizes 36-52."},
    {"name":"MacBook Pro 14 M3 Chip 16GB","price":2350000.0,"category":"Electronics","subcategory":"PCs","location":"Lilongwe","images":["https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800&q=80","https://images.unsplash.com/photo-1611532736597-de2d4265fba3?w=800&q=80"],"commission_percent":5.0,"badge":"HOT","description":"Apple MacBook Pro 14 M3. 16GB RAM, 512GB SSD. 18-hr battery, ProMotion display. 14 months Apple warranty."},
    {"name":"Carved Wooden Elephant Set","price":38000.0,"category":"Fashion","subcategory":"Accessories","location":"Blantyre","images":["https://images.unsplash.com/photo-1474434526052-a73d0d4f7ef0?w=800&q=80","https://images.unsplash.com/photo-1599420186946-7b6fb4e297f0?w=800&q=80"],"commission_percent":5.0,"badge":None,"description":"Hand-carved mopane wood elephant family, 5 graduated sizes. Ebony oil finish. Great decor or souvenir."},
    {"name":"Nissan Navara D40 2019 4x4","price":22000000.0,"category":"Automobiles","subcategory":"Trucks","location":"Mzuzu","images":["https://images.unsplash.com/photo-1544636331-e26879cd4d9b?w=800&q=80","https://images.unsplash.com/photo-1556189250-72ba954cfc2b?w=800&q=80"],"commission_percent":5.0,"badge":None,"description":"2019 Nissan Navara D40 STX+ 4x4, 2.5L diesel manual. 72,000 km. Roof rack, tonneau cover. Authorised dealer service."},
    {"name":"Restaurant Space for Rent - Area 6","price":450000.0,"category":"Real Estate","subcategory":"Houses for rent","location":"Lilongwe","images":["https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&q=80","https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=80"],"commission_percent":5.0,"badge":"NEW","description":"Prime restaurant space, 250sqm. Fitted kitchen, 3-phase electricity. Busy Area 6. MWK 450,000/month. Flexible lease."},
    {"name":"DJI Mini 4 Pro Drone - Fly More","price":1120000.0,"category":"Electronics","subcategory":"Home gadgets","location":"Lilongwe","images":["https://images.unsplash.com/photo-1527977966376-1c8408f9f108?w=800&q=80","https://images.unsplash.com/photo-1473968512647-3e447244af8f?w=800&q=80"],"commission_percent":5.0,"badge":"HOT","description":"DJI Mini 4 Pro Fly More Combo. 4K/60fps, obstacle sensing. 3 batteries, hub, ND filters. Perfect for weddings and content."},
    {"name":"Ladies Leather Handbag - Limited","price":125000.0,"category":"Fashion","subcategory":"Women","location":"Blantyre","images":["https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=800&q=80","https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=800&q=80"],"commission_percent":5.0,"badge":"NEW","description":"Genuine leather tote with Ankara panels. Laptop compartment, 4 pockets. Limited 30 pieces. Black+Kente or Brown+Chitenge."},
    {"name":"Sony A7 IV Mirrorless Camera Kit","price":3100000.0,"category":"Electronics","subcategory":"Home gadgets","location":"Lilongwe","images":["https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=800&q=80","https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=800&q=80"],"commission_percent":5.0,"badge":None,"description":"Sony Alpha A7 IV 33MP, 4K60p, eye tracking. Kit lens, 128GB card, extra battery, bag. All accessories included."},
    {"name":"5-Bedroom Villa with Pool - Namiwawa","price":250000000.0,"category":"Real Estate","subcategory":"Houses for sale","location":"Blantyre","images":["https://images.unsplash.com/photo-1613977257363-707ba9348227?w=800&q=80","https://images.unsplash.com/photo-1615529162924-f8605388461d?w=800&q=80"],"commission_percent":5.0,"badge":"HOT","description":"Exceptional luxury villa, Namiwawa. 5 en-suite bedrooms, home theatre, gym, 12m pool. Smart home, 3-car garage."},
    {"name":"Air Jordan 4 Retro - Lightning","price":220000.0,"category":"Fashion","subcategory":"Shoes","location":"Lilongwe","images":["https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800&q=80","https://images.unsplash.com/photo-1608231387042-66d1773070a5?w=800&q=80"],"commission_percent":5.0,"badge":"HOT","description":"Nike Air Jordan 4 Retro, Lightning. Size 42 (UK8). Brand new deadstock with receipt. Authentic. Hard to find in Malawi!"},
]


async def seed():
    engine = create_async_engine(settings.DATABASE_URL_ASYNC, echo=False)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with Session() as session:
        async with session.begin():
            # Admin user
            r = await session.execute(select(User).where(User.email == ADMIN_EMAIL))
            if not r.scalar_one_or_none():
                session.add(User(
                    email=ADMIN_EMAIL,
                    password_hash=hash_password(ADMIN_PASSWORD),
                    full_name=ADMIN_NAME,
                    is_admin=True,
                    is_active=True,
                ))
                print(f"Created admin: {ADMIN_EMAIL}")
            else:
                print(f"Admin exists: {ADMIN_EMAIL}")

            # Products
            r2 = await session.execute(select(Product))
            if not r2.scalars().all():
                for p in PRODUCTS:
                    session.add(Product(
                        name=p["name"],
                        description=p["description"],
                        price=p["price"],
                        category=p["category"],
                        subcategory=p.get("subcategory"),
                        location=p.get("location"),
                        images=p.get("images", []),
                        commission_percent=p.get("commission_percent", 5.0),
                        badge=p.get("badge"),
                        views=0,
                        likes=0,
                        is_active=True,
                    ))
                print(f"Seeded {len(PRODUCTS)} products")
            else:
                print("Products already seeded — skipping")

    await engine.dispose()
    print("Seed complete")


if __name__ == "__main__":
    asyncio.run(seed())
