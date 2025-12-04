const ColorDot = ({color}) => {
  // Allow tailwind to compile then classes
  const colors = {
    red: "bg-red-800",
    green: "bg-green-800",
    blue: "bg-blue-800",
    yellow: "bg-yellow-800",
  };

  return (
    color !== "none"
      ? <span className={`${colors[color]} w-5 h-5 rounded-full inline-block`} />
      : <span className={`bg-white text-red-500 text-center w-5 h-5 rounded-full inline-block`}>✖</span>
  );
}

export default ColorDot;