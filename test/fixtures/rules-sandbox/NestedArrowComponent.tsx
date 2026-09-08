
      export function ParentCard() {
        const SubItem = () => <div>Item</div>; // Violation: nested component
        return <div><SubItem /></div>;
      }
      