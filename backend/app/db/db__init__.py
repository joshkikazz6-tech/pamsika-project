# Import ALL models here so SQLAlchemy can resolve every relationship.
# This file is the single source of truth for model registration.
from app.models.user import User                              # noqa
from app.models.product import Product                        # noqa
from app.models.cart import Cart, CartItem                    # noqa
from app.models.order import Order, OrderItem                 # noqa
from app.models.favorite import Favorite                      # noqa
from app.models.affiliate import AffiliateClick, AffiliateWithdrawal  # noqa
from app.models.audit import AuditLog                         # noqa
from app.models.community import CommunityPost, CommunityComment, PostLike  # noqa
from app.models.messages import Conversation, Message  # noqa