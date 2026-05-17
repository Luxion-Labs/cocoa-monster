import React from "react";

export const Skeleton = ({
  className = "",
  style = {},
}: {
  className?: string;
  style?: React.CSSProperties;
}) => {
  return (
    <div
      className={`skeleton-shimmer ${className}`}
      style={style}
    />
  );
};

export const MarketCardSkeleton = () => {
  return (
    <div className="market-card skeleton-card" style={{ cursor: "default" }}>
      {/* Topline skeleton */}
      <div className="market-card__topline" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Skeleton style={{ width: "60px", height: "14px" }} />
        <Skeleton style={{ width: "45px", height: "14px", borderRadius: "4px" }} />
      </div>

      {/* Question skeleton */}
      <div style={{ marginTop: "1rem", marginBottom: "1rem" }}>
        <Skeleton style={{ width: "100%", height: "20px", marginBottom: "0.5rem" }} />
        <Skeleton style={{ width: "80%", height: "20px" }} />
      </div>

      {/* Outcomes skeleton */}
      <div className="market-card__outcomes">
        <div className="market-card__outcome" style={{ border: "1px solid var(--border-subtle)", background: "transparent" }}>
          <Skeleton style={{ width: "30px", height: "14px" }} />
          <Skeleton style={{ width: "35px", height: "14px" }} />
        </div>
        <div className="market-card__outcome" style={{ border: "1px solid var(--border-subtle)", background: "transparent" }}>
          <Skeleton style={{ width: "30px", height: "14px" }} />
          <Skeleton style={{ width: "35px", height: "14px" }} />
        </div>
      </div>

      {/* Bottom meta skeleton */}
      <div className="market-card__meta" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto", paddingTop: "0.75rem" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", width: "80px" }}>
          <Skeleton style={{ width: "40px", height: "10px" }} />
          <Skeleton style={{ width: "60px", height: "14px" }} />
        </div>
        <Skeleton style={{ width: "50px", height: "14px" }} />
      </div>
    </div>
  );
};

export const MarketListSkeleton = () => {
  return (
    <ul className="market-list__grid" style={{ pointerEvents: "none" }}>
      {Array.from({ length: 6 }).map((_, idx) => (
        <li key={idx}>
          <MarketCardSkeleton />
        </li>
      ))}
    </ul>
  );
};

export const MarketDetailPageSkeleton = () => {
  return (
    <div className="market-detail__grid" style={{ pointerEvents: "none" }}>
      <div className="market-detail__main">
        {/* Shimmering chart container */}
        <div className="price-chart" style={{ height: "260px", display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <Skeleton style={{ width: "100px", height: "18px" }} />
            <Skeleton style={{ width: "60px", height: "24px" }} />
          </div>
          <Skeleton style={{ width: "100%", height: "160px" }} />
        </div>

        {/* Statistical grid skeletons */}
        <div className="market-detail__stats" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              <Skeleton style={{ width: "70px", height: "12px" }} />
              <Skeleton style={{ width: "90px", height: "20px", marginTop: "0.25rem" }} />
            </div>
          ))}
        </div>
      </div>

      <div className="market-detail__side">
        {/* Betting form skeleton */}
        <div className="bet-form" style={{ minHeight: "280px", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <Skeleton style={{ flex: 1, height: "32px", borderRadius: "6px" }} />
            <Skeleton style={{ flex: 1, height: "32px", borderRadius: "6px" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <Skeleton style={{ width: "50px", height: "12px" }} />
            <Skeleton style={{ width: "100%", height: "34px", borderRadius: "6px" }} />
          </div>
          <Skeleton style={{ width: "100%", height: "80px", borderRadius: "6px" }} />
          <Skeleton style={{ width: "100%", height: "32px", borderRadius: "6px" }} />
        </div>
      </div>
    </div>
  );
};
