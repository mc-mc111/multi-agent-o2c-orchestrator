import asyncio
import logging
from sqlalchemy import text
from sqlmodel import select
from app.db.database import engine, async_session_maker, init_db
from app.db.models import User, Customer, InventorySKU
from app.services.auth_service import hash_password_pgcrypto

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("seed")

async def seed_database():
    logger.info("Initializing database schema & pgcrypto extension...")
    
    async with engine.begin() as conn:
        try:
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS pgcrypto;"))
        except Exception as e:
            logger.warning(f"Could not enable pgcrypto extension (may lack superuser or local mock): {e}")

    await init_db()
    
    async with async_session_maker() as session:
        # 1. Seed Admin User
        user_stmt = select(User).where(User.email == "admin@o2c.com")
        existing_user = (await session.execute(user_stmt)).scalar_one_or_none()
        if not existing_user:
            hashed_pwd = await hash_password_pgcrypto(session, "admin123")
            admin_user = User(
                email="admin@o2c.com",
                hashed_password=hashed_pwd,
                full_name="O2C Operations Admin",
                role="admin"
            )
            session.add(admin_user)
            logger.info("Seeded admin user: admin@o2c.com / admin123")
        
        # 2. Seed B2B Customers
        sample_customers = [
            Customer(
                id="CUST-1001",
                name="Acme Solutions",
                email="procurement@acme-corp.com",
                credit_limit=100000.0,
                current_exposure=12500.0,
                shipping_address="100 Innovation Way, Suite 400, Austin TX 78701",
                billing_address="100 Innovation Way, Suite 400, Austin TX 78701"
            ),
            Customer(
                id="CUST-1002",
                name="TechGlobe Global Inc",
                email="orders@techglobe.io",
                credit_limit=50000.0,
                current_exposure=45000.0,
                shipping_address="500 Silicon Blvd, San Jose CA 95134",
                billing_address="500 Silicon Blvd, San Jose CA 95134"
            ),
            Customer(
                id="CUST-1003",
                name="Nexus Logistics Partners",
                email="purchasing@nexuslogistics.com",
                credit_limit=25000.0,
                current_exposure=0.0,
                shipping_address="75 Freight Terminal Rd, Chicago IL 60666",
                billing_address="75 Freight Terminal Rd, Chicago IL 60666"
            )
        ]
        
        for cust in sample_customers:
            cust_stmt = select(Customer).where(Customer.id == cust.id)
            existing_cust = (await session.execute(cust_stmt)).scalar_one_or_none()
            if not existing_cust:
                session.add(cust)
                logger.info(f"Seeded customer: {cust.name} ({cust.id})")
        
        # 3. Seed Warehouse SKUs
        sample_skus = [
            InventorySKU(
                sku="SKU-SERVER-01",
                name="Rack Server 2U (64-Core, 256GB RAM)",
                description="High-performance data center Rack Server",
                unit_price=3500.00,
                available_quantity=50,
                reserved_quantity=0,
                reorder_threshold=5
            ),
            InventorySKU(
                sku="SKU-LAPTOP-02",
                name="Pro Business Laptop 16-inch M3 Max",
                description="Executive workstation laptop",
                unit_price=2499.99,
                available_quantity=15, # Limited quantity for partial reservation testing
                reserved_quantity=0,
                reorder_threshold=10
            ),
            InventorySKU(
                sku="SKU-MONITOR-03",
                name="UltraWide 38-inch Curved Monitor 4K",
                description="Ergonomic dual-input productivity monitor",
                unit_price=899.00,
                available_quantity=0, # ZERO STOCK for inventory exception testing
                reserved_quantity=0,
                reorder_threshold=5
            ),
            InventorySKU(
                sku="SKU-SWITCH-04",
                name="Managed 48-Port PoE+ Gigabit Network Switch",
                description="Layer 3 Core Switch",
                unit_price=1200.00,
                available_quantity=120,
                reserved_quantity=0,
                reorder_threshold=15
            )
        ]
        
        for item in sample_skus:
            sku_stmt = select(InventorySKU).where(InventorySKU.sku == item.sku)
            existing_sku = (await session.execute(sku_stmt)).scalar_one_or_none()
            if not existing_sku:
                session.add(item)
                logger.info(f"Seeded SKU: {item.name} ({item.sku}) - Qty: {item.available_quantity}")
        
        await session.commit()
        logger.info("Database seeding complete!")

if __name__ == "__main__":
    asyncio.run(seed_database())
