from fastapi import APIRouter
from app.api.v1.endpoints import auth, products, cart, orders, favorites, affiliate, admin, analytics, imgproxy, upload, password_reset, notifications, reviews, promo, export, community, messages, community, messages

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
api_router.include_router(password_reset.router)
api_router.include_router(notifications.router)
api_router.include_router(reviews.router)
api_router.include_router(promo.router)
api_router.include_router(export.router)
api_router.include_router(community.router)
api_router.include_router(messages.router)
api_router.include_router(community.router)
api_router.include_router(messages.router)
