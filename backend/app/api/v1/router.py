from fastapi import APIRouter
from app.api.v1.endpoints import auth, products, cart, orders, favorites, affiliate, admin, analytics, imgproxy, upload

api_router = APIRouter(prefix="/v1")

api_router.include_router(auth.router)
api_router.include_router(products.router)
api_router.include_router(cart.router)
api_router.include_router(orders.router)
api_router.include_router(favorites.router)
api_router.include_router(affiliate.router)
api_router.include_router(admin.router)
api_router.include_router(analytics.router)
api_router.include_router(imgproxy.router)
api_router.include_router(upload.router)
