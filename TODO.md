# Smart Waterway MVP Outcomes

## Role-based demo access
Provide a visible role switcher for Cargo Owner, Boat Operator, and Admin; keep the active role visible and adapt navigation and primary actions to that role.

## Cargo owner quote flow
Allow an owner to post cargo with type, quantity, pickup/drop, urgency, pickup window, and delivery deadline; show waterway vs road price, ETA, CO₂, recommendation, explanation, request booking, and shipment status/timeline.

## Operator fleet and trip flow
Show boats, capacity/utilization, status, and trip proposals; allow accept/decline with a reason and progress actions for departed, arrived, delay, and unavailable/breakdown.

## Network optimization
Provide Lowest Cost, Lowest CO₂, Fastest, and Balanced modes; Optimize Network must show before/after cost, CO₂, ETA, utilization, empty km, pooled cargo, backhaul, and explainable boat recommendations; Publish plan changes statuses and notifications.

## Notifications and activity
Show role-targeted unread notifications and a live activity feed, updating them for booking, publishing, decline, delay, and disruption actions.

## Disruption recovery
Provide B-104 Unavailable, generate a recovery draft with reassignment, added cost, delay, and penalty avoided, then approve recovery and update affected statuses, activity, and notifications.

## Simulator and delay risk
Allow what-if changes for boat removal, demand, route closure, and road cost without mutating the live plan; display deterministic metric deltas and rule-based delay risk indicators.

## Runtime and quality
Serve the declared route manifest, preserve the health endpoint, pass type checks/build, and keep the dashboard responsive and accessible.
